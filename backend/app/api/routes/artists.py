from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_optional_user
from app.core.database import get_db
from app.models.song import SongStatus
from app.models.user import Artist, User
from app.schemas.song import SongOut
from app.services import follow_service, song_service

router = APIRouter(prefix="/artists", tags=["artists"])


@router.get("")
async def list_artists(db: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await db.execute(select(Artist).where(Artist.deleted_at.is_(None)).limit(50))
    artists = result.scalars().all()
    return [{"id": str(a.id), "name": a.name, "slug": a.slug, "bio": a.bio, "avatar_url": a.avatar_url} for a in artists]


@router.get("/{slug}")
async def get_artist(
    slug: str,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> dict:
    result = await db.execute(select(Artist).where(Artist.slug == slug, Artist.deleted_at.is_(None)))
    artist = result.scalar_one_or_none()
    if artist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    songs = (
        await song_service.list_public_songs(db, sort="recent", page=1, page_size=50)
    )
    own = [s for s in songs if s.artist_id == artist.id]
    return {
        "id": str(artist.id),
        "name": artist.name,
        "slug": artist.slug,
        "bio": artist.bio,
        "avatar_url": artist.avatar_url,
        "follower_count": await follow_service.follower_count(db, artist.id),
        "is_following": await follow_service.is_following(db, user, artist.id),
        "songs": [song_service.to_song_out(s).model_dump(mode="json") for s in own],
    }
