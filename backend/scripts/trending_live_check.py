"""Live self-test for trending decay against the running backend + its real DB.

Creates two songs, backdates play rows directly in the backend's DB, then
shows the actual /api/songs?sort=trending order.
Run: uv run python scripts/trending_live_check.py [backend-url] [db-url]
"""
import json
import sys
import time
import urllib.error
import urllib.request
import uuid as uuidlib
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import asyncio

BACKEND = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
DB_URL = sys.argv[2] if len(sys.argv) > 2 else "sqlite+aiosqlite:///./.smoke.db"
SUFFIX = f"{int(time.time() * 1000) % 100000000}"


def api(path, data=None, token=None):
    req = urllib.request.Request(
        f"{BACKEND}{path}", method="POST" if data is not None else "GET"
    )
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if data is not None:
        req.add_header("Content-Type", "application/json")
        req.data = json.dumps(data).encode()
    return urllib.request.urlopen(req)


def register(email, username, artist=False):
    body = {"email": email, "username": username, "password": "password123"}
    if artist:
        body["is_artist"] = True
    try:
        with api("/api/auth/register", body) as r:
            return json.load(r)["access_token"]
    except urllib.error.HTTPError as e:
        if e.code == 409:
            with api("/api/auth/login", {"email": email, "password": "password123"}) as r:
                return json.load(r)["access_token"]
        raise


def backdate_plays(song_uuid: str, count: int, days_ago: int) -> None:
    async def _insert() -> None:
        from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

        from app.models.engagement import Play

        engine = create_async_engine(DB_URL)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        created = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=days_ago)
        async with Session() as session:
            for _ in range(count):
                session.add(Play(song_id=uuidlib.UUID(song_uuid), created_at=created))
            await session.commit()
        await engine.dispose()

    asyncio.run(_insert())


def set_play_count(song_uuid: str, count: int) -> None:
    async def _update() -> None:
        from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

        from app.models.song import Song

        engine = create_async_engine(DB_URL)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        async with Session() as session:
            song = await session.get(Song, uuidlib.UUID(song_uuid))
            song.play_count = count
            await session.commit()
        await engine.dispose()

    asyncio.run(_update())


def main():
    artist_tok = register(f"td-artist-{SUFFIX}@smoketest.example.com", f"td_artist_{SUFFIX}", artist=True)
    admin_tok = register("admin-smoke@smoketest.example.com", "smoke_admin")

    boundary = "----td"
    mp3 = b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\x00" * 512
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 128
    songs = {}
    for title in ("Old Hit Live", "Fresh Hit Live"):
        body = (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"title\"\r\n\r\n{title}\r\n".encode("latin-1")
            + b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"t.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n" + mp3 + b"\r\n"
            + b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"cover\"; filename=\"c.png\"\r\nContent-Type: image/png\r\n\r\n" + png + b"\r\n"
            + b"--" + boundary.encode() + b"--\r\n"
        )
        up = urllib.request.Request(f"{BACKEND}/api/songs", method="POST")
        up.add_header("Authorization", f"Bearer {artist_tok}")
        up.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
        up.data = body
        song = json.load(urllib.request.urlopen(up))
        with api(f"/api/admin/songs/{song['id']}/approve", {}, token=admin_tok) as r:
            assert json.load(r)["status"] == "APPROVED"
        songs[title] = song

    old_id = songs["Old Hit Live"]["id"]
    fresh_id = songs["Fresh Hit Live"]["id"]

    # Old Hit: 30 lifetime plays, all 8 days old (outside 7-day window)
    backdate_plays(old_id, count=30, days_ago=8)
    set_play_count(old_id, count=30)
    # Fresh Hit: 5 recent plays (inside the window)
    backdate_plays(fresh_id, count=5, days_ago=0)
    set_play_count(fresh_id, count=5)

    trending = json.load(urllib.request.urlopen(f"{BACKEND}/api/songs?sort=trending&page_size=10"))
    order = [(s["title"], s["play_count"]) for s in trending]
    print("live /api/songs?sort=trending order (title, lifetime play_count):")
    for t, pc in order[:6]:
        print(f"  {pc:>4} plays  {t}")

    ids = [s["id"] for s in trending]
    assert ids.index(fresh_id) < ids.index(old_id), (
        f"decay broken: old (30 lifetime) ranked above fresh (5 recent): {order[:4]}"
    )
    print("\nTRENDING DECAY LIVE CHECK: PASS — recent activity outranks stale lifetime count")


if __name__ == "__main__":
    main()
