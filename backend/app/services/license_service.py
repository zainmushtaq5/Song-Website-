"""License/rights workflow: one current license per song.

Artists submit rights info (resets review to PENDING). Admins approve /
reject / suspend / reinstate. Downloads are gated on an APPROVED,
non-expired license. Expiry is enforced lazily at gate time so correctness
never depends on the background worker (Phase 3.4 sweeps it actively).
"""

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.license import License, LicenseStatus
from app.models.song import AdminAction
from app.models.user import User
from app.schemas.license import LicenseOut, LicenseUpdate


def license_status_now(lic: License | None) -> LicenseStatus | None:
    """Effective status: an APPROVED license past its expiry reads as EXPIRED."""
    if lic is None:
        return None
    if lic.status == LicenseStatus.APPROVED and lic.is_expired(datetime.now(UTC).replace(tzinfo=None)):
        return LicenseStatus.EXPIRED
    return lic.status


def to_license_out(lic: License, song_title: str | None = None, artist_name: str | None = None) -> LicenseOut:
    return LicenseOut(
        id=lic.id,
        song_id=lic.song_id,
        song_title=song_title,
        artist_name=artist_name,
        status=license_status_now(lic),
        license_type=lic.license_type,
        rights_holder=lic.rights_holder,
        proof_reference=lic.proof_reference,
        effective_from=lic.effective_from,
        effective_until=lic.effective_until,
        reviewed_at=lic.reviewed_at,
        review_note=lic.review_note,
        action_reason=lic.action_reason,
        created_at=lic.created_at,
    )


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid date: {value} (use ISO format, e.g. 2026-12-31)",
        )


async def create_initial_license(db: AsyncSession, song, license_type: str | None) -> None:
    """Called from song upload: every song gets a license record, PENDING by default."""
    lic = License(song_id=song.id, status=LicenseStatus.PENDING, license_type=license_type)
    db.add(lic)
    song.license = lic  # populate in-memory so sync serialization never lazy-loads
    await db.flush()


async def get_song_license(db: AsyncSession, song_id: uuid.UUID) -> License | None:
    result = await db.execute(select(License).where(License.song_id == song_id))
    return result.scalar_one_or_none()


async def get_owned_license(db: AsyncSession, user: User, song_id: uuid.UUID) -> License:
    from app.models.song import Song

    from app.services.song_service import get_artist_by_user

    song = await db.get(Song, song_id)
    if song is None or song.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not found")
    artist = await get_artist_by_user(db, user)
    if artist is None or song.artist_id != artist.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your song")
    lic = await get_song_license(db, song_id)
    if lic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="License not found")
    return lic


async def update_license(db: AsyncSession, user: User, song_id: uuid.UUID, data: LicenseUpdate) -> License:
    from app.models.song import LicenseType

    try:
        LicenseType(data.license_type)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid license_type")
    if data.license_type == LicenseType.OTHER.value and not (data.proof_reference or "").strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="proof_reference is required for license_type 'other'",
        )

    lic = await get_owned_license(db, user, song_id)
    lic.license_type = data.license_type
    lic.rights_holder = data.rights_holder.strip()
    lic.proof_reference = (data.proof_reference or "").strip() or None
    lic.effective_from = _parse_date(data.effective_from)
    lic.effective_until = _parse_date(data.effective_until)
    # any edit resets the review
    lic.status = LicenseStatus.PENDING
    lic.reviewed_by = None
    lic.reviewed_at = None
    lic.review_note = None
    lic.action_reason = None
    await db.flush()
    return lic


async def _song_info(db: AsyncSession, lic: License) -> tuple[str | None, str | None]:
    from app.models.song import Song

    song = await db.get(Song, lic.song_id)
    if song is None:
        return None, None
    return song.title, (song.artist.name if song.artist else None)


async def list_by_status(db: AsyncSession, status_filter: LicenseStatus) -> list[LicenseOut]:
    result = await db.execute(
        select(License).where(License.status == status_filter).order_by(License.created_at)
    )
    out = []
    for lic in result.scalars():
        title, artist_name = await _song_info(db, lic)
        out.append(to_license_out(lic, title, artist_name))
    return out


async def _notify_artist(db: AsyncSession, lic: License, type_, message: str) -> None:
    from app.models.notification import NotificationType
    from app.models.user import Artist

    from app.services import notification_service

    from app.models.song import Song

    song = await db.get(Song, lic.song_id)
    if song is None:
        return
    artist = await db.get(Artist, song.artist_id)
    if artist is None:
        return
    await notification_service.create_notification(
        db, user_id=artist.user_id, type_=type_, message=message, song_id=song.id
    )


async def _log(db: AsyncSession, admin: User, action: str, lic: License, reason: str | None) -> None:
    db.add(
        AdminAction(
            admin_user_id=admin.id,
            action=action,
            target_type="license",
            target_id=lic.id,
            reason=reason,
        )
    )


async def _get_license_or_404(db: AsyncSession, license_id: uuid.UUID) -> License:
    lic = await db.get(License, license_id)
    if lic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="License not found")
    return lic


async def admin_approve(db: AsyncSession, admin: User, license_id: uuid.UUID, note: str | None) -> License:
    lic = await _get_license_or_404(db, license_id)
    if lic.status == LicenseStatus.APPROVED and not lic.is_expired(datetime.now(UTC).replace(tzinfo=None)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="License already approved")
    lic.status = LicenseStatus.APPROVED
    lic.reviewed_by = admin.id
    lic.reviewed_at = datetime.now(UTC).replace(tzinfo=None)
    lic.review_note = note
    lic.action_reason = None
    await _log(db, admin, "license_approve", lic, note)
    await _notify_artist(db, lic, "license_approved", "Your license was approved")
    await db.flush()
    return lic


async def admin_reject(db: AsyncSession, admin: User, license_id: uuid.UUID, reason: str) -> License:
    lic = await _get_license_or_404(db, license_id)
    if lic.status == LicenseStatus.REJECTED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="License already rejected")
    lic.status = LicenseStatus.REJECTED
    lic.reviewed_by = admin.id
    lic.reviewed_at = datetime.now(UTC).replace(tzinfo=None)
    lic.review_note = None
    lic.action_reason = reason
    await _log(db, admin, "license_reject", lic, reason)
    await _notify_artist(db, lic, "license_rejected", f"Your license was rejected: {reason}")
    await db.flush()
    return lic


async def admin_suspend(db: AsyncSession, admin: User, license_id: uuid.UUID, reason: str) -> License:
    lic = await _get_license_or_404(db, license_id)
    if lic.status == LicenseStatus.SUSPENDED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="License already suspended")
    lic.status = LicenseStatus.SUSPENDED
    lic.reviewed_by = admin.id
    lic.reviewed_at = datetime.now(UTC).replace(tzinfo=None)
    lic.action_reason = reason
    await _log(db, admin, "license_suspend", lic, reason)
    await _notify_artist(db, lic, "license_suspended", f"Your license was suspended: {reason}")
    await db.flush()
    return lic


async def admin_reinstate(db: AsyncSession, admin: User, license_id: uuid.UUID) -> License:
    lic = await _get_license_or_404(db, license_id)
    if lic.status == LicenseStatus.APPROVED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="License already approved")
    if lic.status in (LicenseStatus.PENDING, LicenseStatus.REMOVED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only suspended, rejected, or expired licenses can be reinstated",
        )
    lic.status = LicenseStatus.APPROVED
    lic.reviewed_by = admin.id
    lic.reviewed_at = datetime.now(UTC).replace(tzinfo=None)
    lic.action_reason = None
    await _log(db, admin, "license_reinstate", lic, None)
    await _notify_artist(db, lic, "license_approved", "Your license was reinstated")
    await db.flush()
    return lic


async def expire_due_licenses(db: AsyncSession) -> int:
    """Sweep APPROVED licenses past effective_until to EXPIRED (worker calls this)."""
    from app.models.notification import NotificationType

    now = datetime.now(UTC).replace(tzinfo=None)
    result = await db.execute(
        select(License).where(
            License.status == LicenseStatus.APPROVED, License.effective_until.is_not(None)
        )
    )
    changed = 0
    for lic in result.scalars():
        if lic.is_expired(now):
            lic.status = LicenseStatus.EXPIRED
            await _notify_artist(
                db,
                lic,
                NotificationType.LICENSE_SUSPENDED,
                "Your license expired; downloads are disabled",
            )
            changed += 1
    if changed:
        await db.flush()
    return changed