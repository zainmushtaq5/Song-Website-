import asyncio
import uuid as uuidlib
from datetime import UTC, datetime, timedelta

from app.models.engagement import Play
from tests.conftest import MP3_BYTES, PNG_BYTES, _TestSession


def _approved_song(client, auth_headers, admin_headers, title) -> dict:
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    song = client.post("/api/songs", data={"title": title}, files=files, headers=auth_headers).json()
    r = client.post(f"/api/admin/songs/{song['id']}/approve", headers=admin_headers)
    assert r.status_code == 200, r.text
    return song


def _backdated_plays(song_id: str, count: int, days_ago: int) -> None:
    """Insert play rows directly with backdated created_at (API can't do this)."""
    import asyncio

    created = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=days_ago)
    sid = uuidlib.UUID(song_id)

    async def _insert() -> None:
        async with _TestSession() as session:
            for _ in range(count):
                session.add(Play(song_id=sid, created_at=created))
            await session.commit()

    asyncio.run(_insert())


def _set_play_count(song_id: str, count: int) -> None:
    """Simulate a lifetime play_count larger than recent-window plays."""
    import asyncio

    async def _update() -> None:
        from app.models.song import Song

        async with _TestSession() as session:
            song = await session.get(Song, uuidlib.UUID(song_id))
            song.play_count = count
            await session.commit()

    asyncio.run(_update())


def test_recent_activity_beats_high_lifetime_count(client, auth_headers, admin_headers) -> None:
    old_song = _approved_song(client, auth_headers, admin_headers, "Old Hit")
    new_song = _approved_song(client, auth_headers, admin_headers, "Fresh Hit")

    # "Old Hit": 30 lifetime plays, ALL backdated outside the 7-day window
    _backdated_plays(old_song["id"], count=30, days_ago=8)
    _set_play_count(old_song["id"], 30)

    # "Fresh Hit": only 5 recent plays (inside the window)
    _backdated_plays(new_song["id"], count=5, days_ago=0)
    _set_play_count(new_song["id"], 5)

    trending = client.get("/api/songs?sort=trending&page_size=10").json()
    ids = [s["id"] for s in trending]
    assert old_song["id"] in ids and new_song["id"] in ids

    # Raw play count would rank Old Hit (30) above Fresh Hit (5).
    # Time-weighted score ranks Fresh Hit first (5 recent vs 0 in window).
    assert ids.index(new_song["id"]) < ids.index(old_song["id"]), (
        f"expected recent song first, got: {[s['title'] for s in trending]}"
    )


def test_window_activity_beats_none_at_same_recency(client, auth_headers, admin_headers) -> None:
    """Both songs have zero recent plays; tiebreak falls back to lifetime count."""
    a = _approved_song(client, auth_headers, admin_headers, "Tiebreak A")
    b = _approved_song(client, auth_headers, admin_headers, "Tiebreak B")
    _backdated_plays(a["id"], count=10, days_ago=8)
    _set_play_count(a["id"], 10)

    trending = client.get("/api/songs?sort=trending&page_size=10").json()
    ids = [s["id"] for s in trending]
    # A has 10 lifetime plays, B has 0 -> A ranks above B on the tiebreaker
    assert ids.index(a["id"]) < ids.index(b["id"])


def test_likes_weight_more_than_plays(client, auth_headers, admin_headers, user_headers) -> None:
    """1 like (weight 3) must outrank 2 plays (weight 2) inside the window."""
    played = _approved_song(client, auth_headers, admin_headers, "Only Plays")
    liked = _approved_song(client, auth_headers, admin_headers, "One Like")

    _backdated_plays(played["id"], count=2, days_ago=0)   # score 2
    _set_play_count(played["id"], 2)

    # 1 like on "One Like" -> score 3 (via API so created_at is now)
    sid = liked["id"]
    r = client.post(f"/api/songs/{sid}/like", headers=user_headers)
    assert r.status_code == 200

    trending = client.get("/api/songs?sort=trending&page_size=10").json()
    ids = [s["id"] for s in trending]
    assert ids.index(liked["id"]) < ids.index(played["id"])


def test_recent_sort_unchanged(client, auth_headers, admin_headers) -> None:
    """sort=recent still orders by created_at (Phase 1 behavior untouched)."""
    first = _approved_song(client, auth_headers, admin_headers, "Recent One")
    second = _approved_song(client, auth_headers, admin_headers, "Recent Two")
    recent = client.get("/api/songs?sort=recent&page_size=10").json()
    ids = [s["id"] for s in recent]
    assert ids.index(second["id"]) < ids.index(first["id"])
