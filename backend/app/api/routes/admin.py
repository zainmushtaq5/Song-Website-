from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.database import get_db
from app.models.notification import NotificationType
from app.models.song import AdminAction, Song, SongStatus
from app.models.user import User
from app.schemas.song import SongDelete, SongOut, SongRejected, SongStatusOut
from app.services import notification_service, song_service

router = APIRouter(prefix="/admin", tags=["admin"])

#: Statuses the admin song list accepts, plus ALL for direct management of any song.
REVIEW_FILTERS = ("ALL", *[s.value for s in SongStatus])


@router.get("/songs", response_model=list[SongOut])
async def list_admin_songs(
    review_status: str = "PENDING",
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[SongOut]:
    review_status = review_status.upper()
    if review_status not in REVIEW_FILTERS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid status")
    stmt = select(Song).where(Song.deleted_at.is_(None))
    if review_status == "ALL":
        # Newest first: a management list is browsed from the top, unlike a queue.
        stmt = stmt.order_by(Song.created_at.desc())
    else:
        stmt = stmt.where(Song.status == SongStatus(review_status)).order_by(Song.created_at)
    songs = (await db.execute(stmt)).scalars().all()
    return [song_service.to_song_out(s) for s in songs]



async def _log_admin_action(db: AsyncSession, admin: User, action: str, song: Song, reason: str | None) -> None:
    db.add(
        AdminAction(
            admin_user_id=admin.id,
            action=action,
            target_type="song",
            target_id=song.id,
            reason=reason,
        )
    )
    await db.flush()


@router.post("/songs/{song_id}/approve", response_model=SongStatusOut)
async def approve_song(
    song_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> SongStatusOut:
    song = await db.get(Song, song_id)
    if song is None or song.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not found")
    if song.status == SongStatus.APPROVED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Song already approved")
    song.status = SongStatus.APPROVED
    song.rejection_reason = None
    await db.flush()
    await _log_admin_action(db, admin, "song_approve", song, None)
    # Notify the song's owner (artist user)
    await notification_service.create_notification(
        db,
        user_id=song.artist.user_id,
        type_=NotificationType.SONG_APPROVED,
        message=f"Your song \"{song.title}\" was approved and is now live",
        song_id=song.id,
    )
    return SongStatusOut(id=song.id, status=song.status, rejection_reason=None)


@router.post("/songs/{song_id}/reject", response_model=SongStatusOut)
async def reject_song(
    song_id: UUID,
    data: SongRejected,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> SongStatusOut:
    song = await db.get(Song, song_id)
    if song is None or song.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not found")
    if song.status == SongStatus.REJECTED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Song already rejected")
    song.status = SongStatus.REJECTED
    song.rejection_reason = data.rejection_reason
    await db.flush()
    await _log_admin_action(db, admin, "song_reject", song, data.rejection_reason)
    # Notify the song's owner (artist user)
    await notification_service.create_notification(
        db,
        user_id=song.artist.user_id,
        type_=NotificationType.SONG_REJECTED,
        message=f"Your song \"{song.title}\" was rejected: {data.rejection_reason}",
        song_id=song.id,
    )
    return SongStatusOut(id=song.id, status=song.status, rejection_reason=song.rejection_reason)


async def _get_live_song(db: AsyncSession, song_id: UUID) -> Song:
    song = await db.get(Song, song_id)
    if song is None or song.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not found")
    return song


@router.patch("/songs/{song_id}", response_model=SongOut)
async def admin_edit_song(
    song_id: UUID,
    title: str | None = Form(None),
    description: str | None = Form(None),
    genre: str | None = Form(None),
    license_type: str | None = Form(None),
    rights_note: str | None = Form(None),
    download_allowed: bool | None = Form(None),
    note: str | None = Form(None),
    cover: UploadFile | None = File(None),
    audio: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> SongOut:
    """Direct edit of any song, independent of the artist request-queue workflow.

    Field semantics are the ones an edit form expects: a field that is absent is
    unchanged, an empty string clears it. Replacing the audio re-queues the probe job,
    so duration/bitrate/sample_rate are recomputed from the new bytes exactly as they
    are for a fresh upload. The change set is written to the admin audit log.
    """
    song = await _get_live_song(db, song_id)
    changed, audio_replaced = await song_service.admin_update_song(
        db,
        song,
        title=title,
        description=description,
        genre=genre,
        license_type_raw=license_type,
        rights_note=rights_note,
        download_allowed=download_allowed,
        audio=audio,
        cover=cover,
    )
    if changed:
        summary = f"changed: {', '.join(changed)}"
        if audio_replaced:
            summary += " (re-probing audio)"
        await _log_admin_action(db, admin, "song_edit", song, f"{summary}. {note}".strip() if note else summary)
    return song_service.to_song_out(song)


@router.delete("/songs/{song_id}", response_model=SongStatusOut)
async def admin_delete_song(
    song_id: UUID,
    data: SongDelete | None = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> SongStatusOut:
    """Soft-delete any song and tell its owner.

    Soft, not hard: the row, its storage objects and its engagement history stay put,
    while `deleted_at` takes it out of the feed, search, playlists and detail pages on
    the next request. Nothing is unrecoverable, and the audit log keeps the reason.
    """
    song = await _get_live_song(db, song_id)
    reason = (data.reason if data else None) or None
    song_title = song.title
    artist_user_id = song.artist.user_id
    await song_service.admin_soft_delete(db, song)
    await _log_admin_action(db, admin, "song_delete", song, reason)
    await notification_service.create_notification(
        db,
        user_id=artist_user_id,
        type_=NotificationType.SONG_REMOVED,
        message=f'Your song "{song_title}" was removed by an admin'
        + (f": {reason}" if reason else ""),
        song_id=song.id,
    )
    return SongStatusOut(id=song.id, status=song.status, rejection_reason=None)
