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


def make_wav(seconds=3, sample_rate=22050, freq=220.0):
    """A short audible tone (fundamental + two harmonics, slow swell).

    Silence would decode but leaves nothing to look at in players or in the
    analyser, so demos carry a real signal.
    """
    import math
    import struct

    frames = bytearray()
    total = seconds * sample_rate
    for i in range(total):
        t = i / sample_rate
        swell = 0.35 + 0.65 * abs(math.sin(math.pi * 0.25 * t))
        stack = (
            math.sin(2 * math.pi * freq * t)
            + 0.5 * math.sin(4 * math.pi * freq * t)
            + 0.25 * math.sin(6 * math.pi * freq * t)
        ) / 1.75
        value = max(-1.0, min(1.0, 0.6 * swell * stack))
        frames.extend(struct.pack("<h", int(value * 32767)))
    header = (
        b"RIFF"
        + struct.pack("<I", 36 + len(frames))
        + b"WAVEfmt "
        + struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, sample_rate * 2, 2, 16)
        + b"data"
        + struct.pack("<I", len(frames))
    )
    return header + bytes(frames)


def make_png(hue_deg=265.0, size=96):
    """A real decodable PNG (8-bit truecolour vertical gradient).

    The feed renders these covers and e2e/media-test.mjs asserts the bytes
    actually decode (`naturalWidth > 0`), so a signature-plus-zero-bytes stub is
    not good enough.
    """
    import colorsys
    import struct
    import zlib

    top = colorsys.hsv_to_rgb((hue_deg % 360) / 360.0, 0.55, 0.85)
    rows = bytearray()
    for y in range(size):
        shade = 1.0 - 0.55 * (y / (size - 1))
        rows.append(0)  # filter type: none
        rows.extend(bytes(int(255 * channel * shade) for channel in top) * size)

    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(rows), 9))
        + chunk(b"IEND", b"")
    )


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

    #: Cover hue per genre, so the seeded feed has visual variety.
    genre_hue = {"Synthwave": 275.0, "Indie Folk": 35.0, "Post Rock": 205.0}

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
    for index, (artist, title, genre) in enumerate(catalog):
        r = c.post(
            "/api/songs",
            data={"title": title, "genre": genre, "description": f"{genre} demo track"},
            files={
                "audio": ("t.wav", make_wav(freq=180.0 + 30.0 * index), "audio/wav"),
                # Covers are hue-coded per genre so the feed does not look monochrome.
                "cover": ("c.png", make_png(genre_hue.get(genre, 265.0)), "image/png"),
            },
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