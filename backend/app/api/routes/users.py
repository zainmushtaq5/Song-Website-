from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.rate_limit import enforce_rate_limit
from app.models.user import User
from app.schemas.song import SongOut
from app.schemas.auth import UserOut
from app.services import follow_service, song_service
from app.services.auth_service import to_user_out

router = APIRouter(prefix="/users", tags=["users"])


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
