from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_optional_user
from app.core.database import get_db
from app.models.engagement import PlaySource
from app.models.song import Song, SongStatus
from app.models.user import User
from app.schemas.song import SongOut
from app.services import song_service

router = APIRouter(prefix="/songs", tags=["songs"])


@router.get("", response_model=list[SongOut])
async def list_songs(
    request: Request,
    sort: str = "recent",
    page: int = 1,
    page_size: int = 20,
    genre: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[SongOut]:
    if sort not in ("recent", "trending"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid sort")
    songs = await song_service.list_public_songs(db, sort, page, min(page_size, 50), genre)
    return [song_service.to_song_out(s) for s in songs]


@router.get("/mine", response_model=list[SongOut])
async def my_uploads(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> list[SongOut]:
    songs = await song_service.artist_uploads(db, user)
    return [song_service.to_song_out(s) for s in songs]

@router.get("/lookup-metadata")
async def lookup_song_meta(
    title: str,
    request: Request,
    user: User = Depends(get_current_user),
) -> dict:
    if not title or not title.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Song title is required"
        )
    try:
        from app.services.metadata_service import lookup_song_metadata

        return await lookup_song_metadata(title.strip())
    except Exception as exc:
        import logging
        import traceback

        logging.getLogger(__name__).error("Metadata lookup error: %s", traceback.format_exc())
        return {
            "song_name": title.strip(),
            "artist_name": None,
            "album": None,
            "genre": None,
            "cover_url": None,
            "cover_data_url": None,
            "license_type": "artist_owned",
            "download_allowed": False,
            "description": "",
            "tags": [],
            "sources": [],
            "error_detail": str(exc),
        }


@router.get("/cover-proxy")
async def cover_proxy(
    url: str,
    user: User = Depends(get_current_user),
):
    import asyncio
    import urllib.request
    from fastapi.responses import Response

    if not url.startswith("http://") and not url.startswith("https://"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid URL")

    def _fetch():
        req = urllib.request.Request(url, headers={"User-Agent": "SongsWebsite/1.0"})
        with urllib.request.urlopen(req, timeout=8.0) as resp:
            return resp.read(), resp.headers.get("content-type", "image/jpeg")

    try:
        content, ct = await asyncio.to_thread(_fetch)
        return Response(content=content, media_type=ct)
    except Exception:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to fetch image")


@router.get("/by-slug/{slug}", response_model=SongOut)
async def get_song_by_slug(slug: str, db: AsyncSession = Depends(get_db)) -> SongOut:
    from sqlalchemy import select

    result = await db.execute(
        select(Song).where(
            Song.slug == slug,
            Song.status == SongStatus.APPROVED,
            Song.deleted_at.is_(None),
        )
    )
    song = result.scalar_one_or_none()
    if song is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not found")
    return song_service.to_song_out(song)


@router.get("/{song_id}", response_model=SongOut)
async def get_song(
    song_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> SongOut:
    if user and user.is_admin():
        song = await song_service.get_owned_song(db, song_id, user)
    else:
        song = await song_service.get_public_song(db, song_id)
    return song_service.to_song_out(song)


@router.post("", response_model=SongOut, status_code=status.HTTP_201_CREATED)
async def upload_song(
    request: Request,
    title: str = Form(...),
    description: str | None = Form(None),
    genre: str | None = Form(None),
    download_allowed: bool = Form(False),
    license_type: str | None = Form(None),
    rights_note: str | None = Form(None),
    audio: UploadFile = File(...),
    cover: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SongOut:
    from app.models.song import LicenseType
    from pydantic import ValidationError

    from app.schemas.song import SongCreateMeta

    try:
        lt = LicenseType(license_type) if license_type else None
        meta = SongCreateMeta(
            title=title,
            description=description,
            genre=genre,
            download_allowed=download_allowed,
            license_type=lt,
            rights_note=rights_note,
        )
    except ValidationError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid metadata")

    song = await song_service.create_song(db, request, user, meta, audio, cover)
    return song_service.to_song_out(song)


@router.post("/{song_id}/play", response_model=SongOut)
async def play_song(
    song_id: UUID,
    request: Request,
    source: str = "player",
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> SongOut:
    src = PlaySource(source) if source in PlaySource.__members__ else PlaySource.PLAYER
    song = await song_service.record_play(db, request, song_id, user, src)
    return song_service.to_song_out(song)


@router.post("/{song_id}/download")
async def download_song(
    song_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    url = await song_service.record_download(db, request, song_id, user)
    return {"download_url": url, "expires_in": 900}


@router.post("/{song_id}/like")
async def like_song(
    song_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    liked = await song_service.toggle_like(db, request, song_id, user)
    return {"liked": liked}
