"""Artist-facing analytics aggregated over existing engagement rows.

No new tables: reads plays/downloads/likes joined to the caller's songs
(via their artist profile). Portable SQL (same naive-UTC comparison
pattern as trending decay).
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.engagement import Download, Like, Play
from app.models.song import Song
from app.models.user import Artist, User


def _cutoffs() -> tuple[datetime, datetime]:
    now = datetime.now(UTC).replace(tzinfo=None)
    return now - timedelta(days=7), now - timedelta(days=30)


ANALYTICS_WINDOWS = (7, 30, 90)


def _day_keys(days: int, today) -> list[str]:
    """Contiguous ISO day keys ending today (oldest first)."""
    return [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]


async def _daily_counts(db: AsyncSession, model, song_ids: list, cutoff: datetime) -> dict[str, int]:
    """Bucket engagement rows per UTC day (portable: bucketing in Python)."""
    rows = (
        await db.execute(
            select(model.created_at).where(model.song_id.in_(song_ids), model.created_at >= cutoff)
        )
    ).all()
    counts: dict[str, int] = {}
    for (created_at,) in rows:
        key = created_at.date().isoformat() if hasattr(created_at, "date") else str(created_at)[:10]
        counts[key] = counts.get(key, 0) + 1
    return counts


def _build_series(day_keys: list[str], plays: dict, likes: dict, downloads: dict) -> list[dict]:
    return [
        {
            "date": d,
            "plays": plays.get(d, 0),
            "likes": likes.get(d, 0),
            "downloads": downloads.get(d, 0),
        }
        for d in day_keys
    ]


async def _series_for_songs(db: AsyncSession, song_ids: list, days: int) -> list[dict]:
    now = datetime.now(UTC).replace(tzinfo=None)
    cutoff = now - timedelta(days=days)
    keys = _day_keys(days, now.date())
    plays = await _daily_counts(db, Play, song_ids, cutoff)
    likes = await _daily_counts(db, Like, song_ids, cutoff)
    downloads = await _daily_counts(db, Download, song_ids, cutoff)
    return _build_series(keys, plays, likes, downloads)


async def _window_count(db: AsyncSession, model, user_id: uuid.UUID, cutoff) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(model)
        .join(Song, Song.id == model.song_id)
        .join(Artist, Song.artist_id == Artist.id)
        .where(Artist.user_id == user_id, model.created_at >= cutoff)
    )
    return int(result.scalar_one())


async def get_analytics(db: AsyncSession, user: User, window: int = 30) -> dict:
    """Analytics for the user's artist profile (zeros if they never uploaded).

    `window` (7/30/90) controls the daily time series length.
    """
    cutoff7, cutoff30 = _cutoffs()

    owned = (
        await db.execute(
            select(Song)
            .join(Artist, Song.artist_id == Artist.id)
            .where(Artist.user_id == user.id, Song.deleted_at.is_(None))
        )
    ).scalars().all()

    totals = {"plays": 0, "downloads": 0, "likes": 0}
    top_songs: list[dict] = []

    if owned:
        totals = {
            "plays": sum(s.play_count for s in owned),
            "downloads": sum(s.download_count for s in owned),
            "likes": sum(s.like_count for s in owned),
        }
        top_rows = sorted(owned, key=lambda s: (s.play_count, s.created_at), reverse=True)[:5]
        top_songs = [
            {
                "id": str(s.id),
                "title": s.title,
                "plays": s.play_count,
                "downloads": s.download_count,
                "likes": s.like_count,
            }
            for s in top_rows
        ]

    last_7_plays = await _window_count(db, Play, user.id, cutoff7) if owned else 0
    last_7_downloads = await _window_count(db, Download, user.id, cutoff7) if owned else 0
    last_30_plays = await _window_count(db, Play, user.id, cutoff30) if owned else 0
    last_30_downloads = await _window_count(db, Download, user.id, cutoff30) if owned else 0

    series = (
        await _series_for_songs(db, [s.id for s in owned], window) if owned else _build_series(
            _day_keys(window, datetime.now(UTC).replace(tzinfo=None).date()), {}, {}, {}
        )
    )

    return {
        "song_count": len(owned),
        "totals": totals,
        "last_7_days": {"plays": last_7_plays, "downloads": last_7_downloads},
        "last_30_days": {"plays": last_30_plays, "downloads": last_30_downloads},
        "window": window,
        "series": series,
        "top_songs": top_songs,
    }


async def get_song_analytics(db: AsyncSession, user: User, song_id: uuid.UUID, window: int = 30) -> dict:
    """Daily time series for one of the caller's own songs (owner-only)."""
    song = await db.get(Song, song_id)
    if song is None or song.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not found")
    result = await db.execute(select(Artist).where(Artist.id == song.artist_id))
    owner_artist = result.scalar_one_or_none()
    if owner_artist is None or owner_artist.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your song")

    return {
        "song": {"id": str(song.id), "title": song.title},
        "window": window,
        "totals": {
            "plays": song.play_count,
            "downloads": song.download_count,
            "likes": song.like_count,
        },
        "series": await _series_for_songs(db, [song.id], window),
    }
