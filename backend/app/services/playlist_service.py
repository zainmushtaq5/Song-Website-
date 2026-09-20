import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.playlist import Playlist, PlaylistSong
from app.models.song import Song, SongStatus
from app.models.user import User
from app.schemas.playlist import PlaylistUpdate
from app.services.storage_service import storage
from app.utils.slug import unique_slug


async def get_owned_playlist(db: AsyncSession, playlist_id: uuid.UUID, user: User) -> Playlist:
    playlist = await db.get(Playlist, playlist_id)
    if playlist is None or playlist.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")
    if playlist.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your playlist")
    return playlist


async def create_playlist(
    db: AsyncSession, user: User, name: str, description: str | None, is_public: bool
) -> Playlist:
    playlist = Playlist(
        user_id=user.id,
        name=name.strip(),
        slug=unique_slug(name, 200),
        description=(description or "").strip() or None,
        is_public=is_public,
    )
    db.add(playlist)
    await db.flush()
    return playlist


async def _count_and_cover(db: AsyncSession, playlist: Playlist) -> tuple[int, str | None]:
    rows = (
        await db.execute(
            select(PlaylistSong, Song)
            .join(Song, Song.id == PlaylistSong.song_id)
            .where(PlaylistSong.playlist_id == playlist.id, Song.deleted_at.is_(None))
            .order_by(PlaylistSong.position, PlaylistSong.added_at)
        )
    ).all()
    cover = rows[0][1].cover_key if rows else None
    cover_url = storage.presigned_get_url(cover, ttl=3600) if cover else None
    return len(rows), cover_url


async def list_mine(db: AsyncSession, user: User) -> list[dict]:
    playlists = (
        await db.execute(
            select(Playlist)
            .where(Playlist.user_id == user.id, Playlist.deleted_at.is_(None))
            .order_by(Playlist.created_at.desc())
        )
    ).scalars().all()
    out = []
    for p in playlists:
        song_count, cover_url = await _count_and_cover(db, p)
        out.append(
            {
                "id": str(p.id),
                "name": p.name,
                "slug": p.slug,
                "description": p.description,
                "is_public": p.is_public,
                "song_count": song_count,
                "cover_url": cover_url,
                "created_at": p.created_at,
            }
        )
    return out


async def get_detail(db: AsyncSession, slug: str, user: User | None) -> dict:
    playlist = (
        await db.execute(select(Playlist).where(Playlist.slug == slug, Playlist.deleted_at.is_(None)))
    ).scalar_one_or_none()
    if playlist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")

    is_owner = user is not None and playlist.user_id == user.id
    if not playlist.is_public and not is_owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playlist not found")

    rows = (
        await db.execute(
            select(PlaylistSong, Song)
            .join(Song, Song.id == PlaylistSong.song_id)
            .where(
                PlaylistSong.playlist_id == playlist.id,
                Song.deleted_at.is_(None),
                Song.status == SongStatus.APPROVED,
            )
            .order_by(PlaylistSong.position, PlaylistSong.added_at)
        )
    ).all()
    owner = await db.get(User, playlist.user_id)

    from app.schemas.song import SongOut
    from app.services.song_service import to_song_out

    songs = [to_song_out(row[1]) for row in rows]
    detail = {
        "id": str(playlist.id),
        "name": playlist.name,
        "slug": playlist.slug,
        "description": playlist.description,
        "is_public": playlist.is_public,
        "owner": owner.username if owner else "unknown",
        "song_count": len(songs),
        "cover_url": storage.presigned_get_url(rows[0][1].cover_key, ttl=3600) if rows else None,
        "created_at": playlist.created_at,
        "songs": [s.model_dump(mode="json") for s in songs],
    }
    return detail


async def update_playlist(db: AsyncSession, playlist: Playlist, data: PlaylistUpdate) -> None:
    if data.name is not None and data.name.strip():
        playlist.name = data.name.strip()
    if data.description is not None:
        playlist.description = data.description.strip() or None
    if data.is_public is not None:
        playlist.is_public = data.is_public
    await db.flush()


async def soft_delete(db: AsyncSession, playlist: Playlist) -> None:
    from datetime import UTC, datetime

    playlist.deleted_at = datetime.now(UTC)
    await db.flush()


async def add_song(db: AsyncSession, playlist: Playlist, song_id: uuid.UUID) -> None:
    song = await db.get(Song, song_id)
    if song is None or song.deleted_at is not None or song.status != SongStatus.APPROVED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not found")

    duplicate = (
        await db.execute(
            select(PlaylistSong).where(
                PlaylistSong.playlist_id == playlist.id, PlaylistSong.song_id == song_id
            )
        )
    ).scalar_one_or_none()
    if duplicate:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Song already in playlist")

    max_pos = (
        await db.execute(
            select(func.coalesce(func.max(PlaylistSong.position), -1)).where(
                PlaylistSong.playlist_id == playlist.id
            )
        )
    ).scalar_one()
    db.add(PlaylistSong(playlist_id=playlist.id, song_id=song_id, position=max_pos + 1))
    await db.flush()


async def remove_song(db: AsyncSession, playlist: Playlist, song_id: uuid.UUID) -> None:
    row = (
        await db.execute(
            select(PlaylistSong).where(
                PlaylistSong.playlist_id == playlist.id, PlaylistSong.song_id == song_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not in playlist")
    await db.delete(row)
    await db.flush()
