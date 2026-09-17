from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.user import SearchResults
from app.services import song_service

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchResults)
async def search(
    request: Request,
    q: str = "",
    db: AsyncSession = Depends(get_db),
) -> SearchResults:
    songs, artists = await song_service.search(db, request, q)
    return SearchResults(
        query=q,
        songs=[
            {
                "id": str(s.id),
                "title": s.title,
                "slug": s.slug,
                "cover_url": None,
                "duration_sec": s.duration_sec,
                "play_count": s.play_count,
                "like_count": s.like_count,
                "download_allowed": s.download_allowed,
                "artist_name": s.artist.name if s.artist else "",
                "artist_slug": s.artist.slug if s.artist else "",
            }
            for s in songs
        ],
        artists=[
            {"id": str(a.id), "name": a.name, "slug": a.slug, "bio": a.bio, "avatar_url": a.avatar_url}
            for a in artists
        ],
    )
