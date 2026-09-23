from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.core.database import get_db
from app.models.license import LicenseStatus
from app.models.user import User
from app.schemas.license import LicenseOut, LicenseStatusOut, LicenseUpdate
from app.services import license_service

router = APIRouter(tags=["licenses"])


class LicenseNote(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


class LicenseReason(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)


# ---------- artist ----------


@router.get("/songs/{song_id}/license", response_model=LicenseOut)
async def get_license(
    song_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LicenseOut:
    lic = await license_service.get_owned_license(db, user, song_id)
    from app.models.song import Song

    song = await db.get(Song, song_id)
    title = song.title if song else None
    artist_name = song.artist.name if song and song.artist else None
    return license_service.to_license_out(lic, title, artist_name)


@router.put("/songs/{song_id}/license", response_model=LicenseOut)
async def update_license(
    song_id: UUID,
    data: LicenseUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LicenseOut:
    lic = await license_service.update_license(db, user, song_id, data)
    title, artist_name = await license_service._song_info(db, lic)
    return license_service.to_license_out(lic, title, artist_name)


# ---------- admin ----------


@router.get("/admin/licenses", response_model=list[LicenseOut])
async def admin_list_licenses(
    review_status: str = "PENDING",
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[LicenseOut]:
    try:
        st = LicenseStatus(review_status)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid status")
    return await license_service.list_by_status(db, st)


@router.post("/admin/licenses/{license_id}/approve", response_model=LicenseStatusOut)
async def admin_approve_license(
    license_id: UUID,
    data: LicenseNote,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> LicenseStatusOut:
    lic = await license_service.admin_approve(db, admin, license_id, data.note)
    return LicenseStatusOut(id=lic.id, song_id=lic.song_id, status=lic.status, action_reason=None)


@router.post("/admin/licenses/{license_id}/reject", response_model=LicenseStatusOut)
async def admin_reject_license(
    license_id: UUID,
    data: LicenseReason,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> LicenseStatusOut:
    lic = await license_service.admin_reject(db, admin, license_id, data.reason)
    return LicenseStatusOut(id=lic.id, song_id=lic.song_id, status=lic.status, action_reason=lic.action_reason)


@router.post("/admin/licenses/{license_id}/suspend", response_model=LicenseStatusOut)
async def admin_suspend_license(
    license_id: UUID,
    data: LicenseReason,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> LicenseStatusOut:
    lic = await license_service.admin_suspend(db, admin, license_id, data.reason)
    return LicenseStatusOut(id=lic.id, song_id=lic.song_id, status=lic.status, action_reason=lic.action_reason)


@router.post("/admin/licenses/{license_id}/reinstate", response_model=LicenseStatusOut)
async def admin_reinstate_license(
    license_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> LicenseStatusOut:
    lic = await license_service.admin_reinstate(db, admin, license_id)
    return LicenseStatusOut(id=lic.id, song_id=lic.song_id, status=lic.status, action_reason=None)