"""Manual smoke test: full Phase 1 core loop via HTTP against a running server.

Usage:
  1. Start the server:
       uv run uvicorn app.main:app --port 8000
  2. Promote the smoke admin (first run only):
       uv run python scripts/make_admin.py admin-smoke@smoke.test
     (register it first via register endpoint or let step 3's script do it)
  3. Run:  uv run python scripts/smoke_test.py http://localhost:8000
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
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {label}" + (f" -> {extra}" if not cond else ""))
    if not cond:
        sys.exit(1)


def main() -> None:
    c = httpx.Client(base_url=BASE, timeout=60)
    check("health", c.get("/api/health").json() == {"status": "ok"})

    suffix = str(int(time.time() * 1000) % 100000000)
    email = f"artist-{suffix}@smoketest.example.com"
    uname = f"smoke_artist_{suffix}"

    r = c.post(
        "/api/auth/register",
        json={"email": email, "username": uname, "password": "password123", "is_artist": True},
    )
    check("register artist", r.status_code == 201, r.text)
    ah = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = c.get("/api/auth/me", headers=ah)
    check("auth/me", r.status_code == 200 and r.json()["role"] == "ARTIST", r.text)

    # login round-trip
    r = c.post("/api/auth/login", json={"email": email, "password": "password123"})
    check("login", r.status_code == 200, r.text)

    r = c.post(
        "/api/auth/register",
        json={"email": f"listener-{suffix}@smoketest.example.com", "username": f"smoke_user_{suffix}", "password": "password123"},
    )
    check("register listener", r.status_code == 201, r.text)
    lh = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = c.post(
        "/api/songs",
        data={"title": "Smoke Song", "description": "smoke test track", "genre": "Lo-Fi", "download_allowed": "true", "license_type": "artist_owned"},
        files={"audio": ("track.wav", make_wav(), "audio/wav"), "cover": ("cover.png", make_png(), "image/png")},
        headers=ah,
    )
    check("upload song", r.status_code == 201, r.text)
    song = r.json()
    check("duration probed (FFmpeg or WAV header)", song["duration_sec"] == 2, str(song["duration_sec"]))

    # pending: hidden from public feed and song page
    check("pending hidden from feed", all(s["id"] != song["id"] for s in c.get("/api/songs").json()))
    check("pending hidden from song page", c.get(f"/api/songs/{song['id']}").status_code == 404)

    # RBAC: artist cannot approve own song
    r = c.post(f"/api/admin/songs/{song['id']}/approve", headers=ah)
    check("artist cannot approve", r.status_code == 403, r.text)

    print("\nManual steps (require make_admin.py + restart):")
    print("  make_admin.py admin@smoke.test -> login as admin ->")
    print("  POST /api/admin/songs/<id>/approve -> song appears in feed -> play/download/like\n")


if __name__ == "__main__":
    main()
