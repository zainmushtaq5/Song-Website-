"""Artist-facing analytics aggregated over existing engagement rows.

No new tables: reads plays/downloads/likes joined to the caller's songs
(via their artist profile). Portable SQL (same naive-UTC comparison
pattern as trending decay).
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.engagement import Download, Like, Play
from app.models.song import Song
from app.models.user import Artist, User


def _cutoffs() -> tuple[datetime, datetime]:
    now = datetime.now(UTC).replace(tzinfo=None)
    return now - timedelta(days=7), now - timedelta(days=30)


async def _window_count(db: AsyncSession, model, user_id: uuid.UUID, cutoff) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(model)
        .join(Song, Song.id == model.song_id)
        .join(Artist, Song.artist_id == Artist.id)
        .where(Artist.user_id == user_id, model.created_at >= cutoff)
    )
    return int(result.scalar_one())


async def get_analytics(db: AsyncSession, user: User) -> dict:
    """Analytics for the user's artist profile (zeros if they never uploaded)."""
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

    return {
        "song_count": len(owned),
        "totals": totals,
        "last_7_days": {"plays": last_7_plays, "downloads": last_7_downloads},
        "last_30_days": {"plays": last_30_plays, "downloads": last_30_downloads},
        "top_songs": top_songs,
    }
