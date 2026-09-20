from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.database import get_db
from app.models.notification import NotificationType
from app.models.song import AdminAction, Song, SongStatus
from app.models.user import User
from app.schemas.song import SongOut, SongRejected, SongStatusOut
from app.services import notification_service, song_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/songs", response_model=list[SongOut])
async def list_admin_songs(
    review_status: str = "PENDING",
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[SongOut]:
    try:
        st = SongStatus(review_status)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid status")
    result = await db.execute(
        select(Song).where(Song.status == st, Song.deleted_at.is_(None)).order_by(Song.created_at)
    )
    songs = result.scalars().all()
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
