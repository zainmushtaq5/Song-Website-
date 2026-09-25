"""Re-seed the smoke DB with demo users, songs across genres, and engagement.

Creates admin (via make_admin), 3 artists, 9 songs, likes/plays/follows.
Run: set DATABASE_URL=... && uv run python scripts/seed_demo.py [base-url]
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"


def make_wav(seconds=2, sample_rate=8000):
    import struct

    n = seconds * sample_rate
    data = struct.pack("<" + "h" * n, *([0] * n))
    header = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack(
        "<IHHIIHH", 16, 1, 1, sample_rate, sample_rate * 2, 2, 16
    ) + b"data" + struct.pack("<I", len(data))
    return header + data


def make_png():
    return b"\x89PNG\r\n\x1a\n" + b"\x00" * 256


def register(c, email, username, artist=False):
    r = c.post(
        "/api/auth/register",
        json={"email": email, "username": username, "password": "password123", "is_artist": artist},
    )
    if r.status_code == 201:
        return r.json()["access_token"]
    return c.post("/api/auth/login", json={"email": email, "password": "password123"}).json()["access_token"]


def main():
    c = httpx.Client(base_url=BASE, timeout=60)
    s = str(int(time.time() * 1000) % 1000000)

    admin = register(c, "admin-smoke@smoketest.example.com", "smoke_admin")
    ah = {"Authorization": f"Bearer {admin}"}
    me = c.get("/api/auth/me", headers=ah)
    if me.json().get("role") != "ADMIN":
        print("promoting admin via make_admin.py...")
        import subprocess

        subprocess.run(
            ["cmd", "/c", '"C:\\Users\\Awan\\AppData\\Roaming\\Python\\Python314\\Scripts\\uv.exe" run python scripts/make_admin.py admin-smoke@smoketest.example.com'],
            cwd=Path(__file__).resolve().parents[1],
            env={"DATABASE_URL": "sqlite+aiosqlite:///./.smoke.db"},
            capture_output=True,
        )

    artists = {}
    for name in ("nova", "ripple", "atlas"):
        artists[name] = register(c, f"{name}-{s}@smoketest.example.com", f"{name}_{s}", artist=True)

    songs = {}
    catalog = [
        ("nova", "Neon Skyline", "Synthwave"),
        ("nova", "Midnight Drive", "Synthwave"),
        ("nova", "Chrome Sunset", "Synthwave"),
        ("ripple", "Paper Boats", "Indie Folk"),
        ("ripple", "Harbor Light", "Indie Folk"),
        ("ripple", "Winter Lane", "Indie Folk"),
        ("atlas", "Granite", "Post Rock"),
        ("atlas", "Tectonic", "Post Rock"),
        ("atlas", "Fault Lines", "Post Rock"),
    ]
    for artist, title, genre in catalog:
        r = c.post(
            "/api/songs",
            data={"title": title, "genre": genre, "description": f"{genre} demo track"},
            files={"audio": ("t.wav", make_wav(), "audio/wav"), "cover": ("c.png", make_png(), "image/png")},
            headers={"Authorization": f"Bearer {artists[artist]}"},
        )
        if r.status_code != 201:
            print("upload failed:", r.text)
            continue
        song = r.json()
        c.post(f"/api/admin/songs/{song['id']}/approve", headers=ah)
        songs[title] = song
    print(f"seeded {len(songs)} songs")

    listener = register(c, f"listener-{s}@smoketest.example.com", f"listener_{s}")
    lh = {"Authorization": f"Bearer {listener}"}
    # engagement: likes Synthwave, plays Indie Folk
    for title in ("Neon Skyline", "Midnight Drive"):
        c.post(f"/api/songs/{songs[title]['id']}/like", headers=lh)
    for title in ("Paper Boats", "Harbor Light", "Winter Lane"):
        for _ in range(2):
            c.post(f"/api/songs/{songs[title]['id']}/play", headers=lh)

    # follows: listener follows nova
    arts = c.get("/api/artists").json()
    if isinstance(arts, list) and arts:
        c.post(f"/api/artists/{arts[0]['slug']}/follow", headers=lh)

    recs = c.get("/api/recommendations", headers=lh).json()
    print("listener recommendations:", [x["title"] for x in recs["songs"]][:6])
    print("artist suggestions:", [a["name"] for a in recs["artists"]])


if __name__ == "__main__":
    main()