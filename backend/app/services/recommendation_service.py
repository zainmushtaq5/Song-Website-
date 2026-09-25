"""Rule-based recommendation engine (no ML).

Signals: what the user liked (likes) and what they played (plays).
Scoring for candidate songs (APPROVED, public, not the user's own,
not already liked):
    genre match  * 3
    artist match * 2
    popularity     play_count * 0.01 + like_count * 0.05
    recency        +2 if released in the last 30 days
Signals-less users (and anonymous visitors) get a popularity/recency mix.
Artist suggestions: active artists in the user's top genres, not followed,
ranked by their songs' total plays.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.engagement import Follow, Like, Play
from app.models.song import Song, SongStatus
from app.models.user import Artist, User
from app.services.song_service import to_song_out

RECOMMEND_LIMIT = 12
ARTIST_LIMIT = 4


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


async def _user_signal_songs(db: AsyncSession, user_id: uuid.UUID) -> list[Song]:
    """Songs the user liked or played, most relevant first."""
    liked = (
        await db.execute(
            select(Song).join(Like, Like.song_id == Song.id).where(Like.user_id == user_id)
        )
    ).scalars().all()
    played = (
        await db.execute(
            select(Song, func.count().label("plays"))
            .join(Play, Play.song_id == Song.id)
            .where(Play.user_id == user_id)
            .group_by(Song.id)
            .order_by(desc("plays"))
        )
    ).all()
    seen: dict[uuid.UUID, Song] = {}
    for s in liked:
        seen[s.id] = s
    for song, _plays in played:
        seen.setdefault(song.id, song)
    return list(seen.values())


def _top_signals(signal_songs: list[Song]) -> tuple[list[uuid.UUID], list[uuid.UUID]]:
    """(top genre ids, top artist ids) from the user's signal songs."""
    genre_counts: dict[uuid.UUID, int] = {}
    artist_counts: dict[uuid.UUID, int] = {}
    for s in signal_songs:
        if s.genre_id:
            genre_counts[s.genre_id] = genre_counts.get(s.genre_id, 0) + 1
        artist_counts[s.artist_id] = artist_counts.get(s.artist_id, 0) + 1
    top_genres = [g for g, _ in sorted(genre_counts.items(), key=lambda kv: -kv[1])[:2]]
    top_artists = [a for a, _ in sorted(artist_counts.items(), key=lambda kv: -kv[1])[:2]]
    return top_genres, top_artists


def _score(song: Song, top_genres: list[uuid.UUID], top_artists: list[uuid.UUID], now: datetime) -> float:
    score = 0.0
    if song.genre_id and song.genre_id in top_genres:
        score += 3.0
    if song.artist_id in top_artists:
        score += 2.0
    score += song.play_count * 0.01 + song.like_count * 0.05
    if song.created_at and song.created_at >= now - timedelta(days=30):
        score += 2.0
    return score


async def _candidate_songs(db: AsyncSession, user: User | None, excluded: set[uuid.UUID]) -> list[Song]:
    stmt = (
        select(Song)
        .where(
            Song.status == SongStatus.APPROVED,
            Song.deleted_at.is_(None),
        )
        .order_by(desc(Song.play_count), desc(Song.created_at))
        .limit(150)
    )
    if user is not None:
        stmt = stmt.join(Artist, Song.artist_id == Artist.id).where(Artist.user_id != user.id)
    songs = (await db.execute(stmt)).scalars().all()
    return [s for s in songs if s.id not in excluded]


async def get_recommendations(db: AsyncSession, user: User | None, limit: int = RECOMMEND_LIMIT) -> dict:
    limit = min(limit, RECOMMEND_LIMIT)
    now = _now()

    excluded: set[uuid.UUID] = set()
    top_genres: list[uuid.UUID] = []
    top_artists: list[uuid.UUID] = []

    if user is not None:
        signal_songs = await _user_signal_songs(db, user.id)
        excluded.update(s.id for s in signal_songs)
        own = (
            await db.execute(
                select(Song.id).join(Artist, Song.artist_id == Artist.id).where(Artist.user_id == user.id)
            )
        ).scalars().all()
        excluded.update(own)
        top_genres, top_artists = _top_signals(signal_songs)

    candidates = await _candidate_songs(db, user, excluded)

    scored = sorted(
        candidates,
        key=lambda s: _score(s, top_genres, top_artists, now),
        reverse=True,
    )[:limit]
    # fill with popularity if personalized picks ran short
    if len(scored) < limit:
        chosen_ids = {s.id for s in scored}
        scored.extend(s for s in candidates if s.id not in chosen_ids)

    # artists: active artists in the user's top genres, not followed, not self
    artists: list[dict] = []
    if user is not None and top_genres:
        followed = set(
            (
                await db.execute(select(Follow.artist_id).where(Follow.follower_id == user.id))
            ).scalars().all()
        )
        own_artist = (
            await db.execute(select(Artist.id).where(Artist.user_id == user.id))
        ).scalar_one_or_none()
        rows = (
            await db.execute(
                select(Artist, func.coalesce(func.sum(Song.play_count), 0).label("plays"))
                .join(Song, Song.artist_id == Artist.id)
                .where(
                    Song.genre_id.in_(top_genres),
                    Song.status == SongStatus.APPROVED,
                    Song.deleted_at.is_(None),
                )
                .group_by(Artist.id)
                .order_by(desc("plays"))
                .limit(20)
            )
        ).all()
        for artist, _plays in rows:
            if artist.id in followed or artist.id == own_artist or artist.deleted_at is not None:
                continue
            artists.append(
                {"id": str(artist.id), "name": artist.name, "slug": artist.slug, "avatar_url": artist.avatar_url}
            )
            if len(artists) >= ARTIST_LIMIT:
                break

    return {
        "songs": [to_song_out(s) for s in scored],
        "artists": artists,
    }