from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.song import SongOut
from app.services import analytics_service, follow_service, song_service

router = APIRouter(prefix="/users", tags=["users"])


def _validated_window(window: int) -> int:
    if window not in analytics_service.ANALYTICS_WINDOWS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="window must be one of 7, 30, 90",
        )
    return window


@router.get("/me/analytics")
async def my_analytics(
    window: int = 30,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    _validated_window(window)
    return await analytics_service.get_analytics(db, user, window)


@router.get("/me/analytics/songs/{song_id}")
async def my_song_analytics(
    song_id: UUID,
    window: int = 30,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    _validated_window(window)
    return await analytics_service.get_song_analytics(db, user, song_id, window)


@router.get("/me/following")
async def my_following(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> list[dict]:
    artists = await follow_service.user_following_artists(db, user)
    return [
        {"id": str(a.id), "name": a.name, "slug": a.slug, "avatar_url": a.avatar_url}
        for a in artists
    ]


@router.get("/me/likes", response_model=list[SongOut])
async def my_likes(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> list[SongOut]:
    songs = await song_service.user_likes(db, user)
    return [song_service.to_song_out(s) for s in songs]
