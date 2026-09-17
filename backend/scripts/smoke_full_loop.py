"""Complete live e2e loop: register admin externally, promote via make_admin.py, then run.

Usage: uv run python scripts/smoke_full_loop.py http://localhost:8000
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"


def make_wav(seconds: int = 2, sample_rate: int = 8000) -> bytes:
    import struct

    n = seconds * sample_rate
    data = struct.pack("<" + "h" * n, *([0] * n))
    header = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack(
        "<IHHIIHH", 16, 1, 1, sample_rate, sample_rate * 2, 2, 16
    ) + b"data" + struct.pack("<I", len(data))
    return header + data


def make_png() -> bytes:
    return b"\x89PNG\r\n\x1a\n" + b"\x00" * 256


def check(label: str, cond: bool, extra: str = "") -> None:
    print(f"[{'PASS' if cond else 'FAIL'}] {label}" + (f" -> {extra}" if not cond else ""))
    if not cond:
        sys.exit(1)


def register_or_login(c: httpx.Client, email: str, username: str, artist: bool) -> str:
    r = c.post(
        "/api/auth/register",
        json={"email": email, "username": username, "password": "password123", "is_artist": artist},
    )
    if r.status_code == 201:
        return r.json()["access_token"]
    r = c.post("/api/auth/login", json={"email": email, "password": "password123"})
    return r.json()["access_token"]


def main() -> None:
    c = httpx.Client(base_url=BASE, timeout=60)
    suffix = str(int(time.time() * 1000) % 100000000)

    admin_token = register_or_login(c, "admin-smoke@smoketest.example.com", "smoke_admin", False)
    ah = {"Authorization": f"Bearer {admin_token}"}
    me = c.get("/api/auth/me", headers=ah)
    check("admin account has ADMIN role", me.json().get("role") == "ADMIN", me.text)

    artist_token = register_or_login(c, f"artist-{suffix}@smoketest.example.com", f"smoke_artist_{suffix}", True)
    artist_h = {"Authorization": f"Bearer {artist_token}"}
    listener_token = register_or_login(c, f"listener-{suffix}@smoketest.example.com", f"smoke_user_{suffix}", False)
    listener_h = {"Authorization": f"Bearer {listener_token}"}

    r = c.post(
        "/api/songs",
        data={"title": "Full Loop Song", "description": "e2e", "genre": "Lo-Fi", "download_allowed": "true", "license_type": "artist_owned"},
        files={"audio": ("track.wav", make_wav(), "audio/wav"), "cover": ("cover.png", make_png(), "image/png")},
        headers=artist_h,
    )
    check("artist uploads song", r.status_code == 201, r.text)
    song = r.json()

    review = c.get("/api/admin/songs?review_status=PENDING", headers=ah)
    check("admin sees pending review", any(s["id"] == song["id"] for s in review.json()), review.text)

    r = c.post(f"/api/admin/songs/{song['id']}/approve", headers=ah)
    check("admin approves", r.status_code == 200 and r.json()["status"] == "APPROVED", r.text)

    feed = c.get("/api/songs?sort=recent")
    check("song on public feed", any(s["id"] == song["id"] for s in feed.json()), str(feed.json())[:200])

    detail = c.get(f"/api/songs/{song['id']}")
    check("song detail public", detail.status_code == 200 and detail.json()["cover_url"], detail.text)

    r = c.get(f"/media{detail.json()['cover_url'].split('/media')[1]}")
    check("cover loads via signed media URL", r.status_code == 200, str(r.status_code))

    play = c.post(f"/api/songs/{song['id']}/play", headers=listener_h)
    check("listener plays", play.json()["play_count"] == song["play_count"] + 1, play.text)

    r = c.get(f"/media{detail.json()['audio_url'].split('/media')[1]}")
    check("audio streams via signed media URL", r.status_code == 200, str(r.status_code))

    like = c.post(f"/api/songs/{song['id']}/like", headers=listener_h)
    check("listener likes", like.json() == {"liked": True}, like.text)

    likes = c.get("/api/users/me/likes", headers=listener_h)
    check("liked songs listed", any(s["id"] == song["id"] for s in likes.json()), likes.text)

    dl = c.post(f"/api/songs/{song['id']}/download", headers=listener_h)
    check("listener downloads (allowed)", dl.status_code == 200 and "sig=" in dl.json()["download_url"], dl.text)

    trending = c.get("/api/songs?sort=trending")
    check("trending sort works (plays counted)", trending.json()[0]["id"] == song["id"], str(trending.json())[:200])

    search = c.get("/api/search?q=Full Loop")
    check("search finds song", any(s["id"] == song["id"] for s in search.json()["songs"]), search.text)

    artist_slug = detail.json()["artist_slug"]
    artist_page = c.get(f"/api/artists/{artist_slug}")
    check("artist page shows song", any(s["id"] == song["id"] for s in artist_page.json()["songs"]), artist_page.text)

    mine = c.get("/api/songs/mine", headers=artist_h)
    check("artist uploads list shows APPROVED", mine.json()[0]["status"] == "APPROVED", mine.text)

    print("\nFULL PHASE 1 CORE LOOP: LIVE E2E PASS\n")


if __name__ == "__main__":
    main()
