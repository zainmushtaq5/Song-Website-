import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_optional_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.playlist import PlaylistCreate, PlaylistSongAdd, PlaylistUpdate
from app.services import playlist_service

router = APIRouter(prefix="/playlists", tags=["playlists"])


@router.post("", status_code=201)
async def create_playlist(
    data: PlaylistCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    playlist = await playlist_service.create_playlist(db, user, data.name, data.description, data.is_public)
    return {"id": str(playlist.id), "name": playlist.name, "slug": playlist.slug, "is_public": playlist.is_public}


@router.get("/mine")
async def my_playlists(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> list[dict]:
    return await playlist_service.list_mine(db, user)


@router.get("/{slug}")
async def playlist_detail(
    slug: str,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> dict:
    return await playlist_service.get_detail(db, slug, user)


@router.patch("/{playlist_id}")
async def update_playlist(
    playlist_id: uuid.UUID,
    data: PlaylistUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    playlist = await playlist_service.get_owned_playlist(db, playlist_id, user)
    await playlist_service.update_playlist(db, playlist, data)
    return {"id": str(playlist.id), "name": playlist.name, "is_public": playlist.is_public}


@router.delete("/{playlist_id}", status_code=204)
async def delete_playlist(
    playlist_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    playlist = await playlist_service.get_owned_playlist(db, playlist_id, user)
    await playlist_service.soft_delete(db, playlist)


@router.post("/{playlist_id}/songs", status_code=201)
async def add_song(
    playlist_id: uuid.UUID,
    data: PlaylistSongAdd,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    playlist = await playlist_service.get_owned_playlist(db, playlist_id, user)
    await playlist_service.add_song(db, playlist, data.song_id)
    return {"added": str(data.song_id)}


@router.delete("/{playlist_id}/songs/{song_id}", status_code=204)
async def remove_song(
    playlist_id: uuid.UUID,
    song_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    playlist = await playlist_service.get_owned_playlist(db, playlist_id, user)
    await playlist_service.remove_song(db, playlist, song_id)
