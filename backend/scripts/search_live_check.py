"""Live self-test for search ranking against the running backend.

Creates songs with distinct match types (title / artist-name / description),
then prints the actual /api/search order and asserts the ranking rules.
Run: uv run python scripts/search_live_check.py [backend-url]
"""
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BACKEND = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
SUFFIX = f"{int(time.time() * 1000) % 100000000}"


def api(path, data=None, token=None):
    req = urllib.request.Request(f"{BACKEND}{path}", method="POST" if data is not None else "GET")
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


def main():
    artist_tok = register(f"sr-live-{SUFFIX}@smoketest.example.com", f"searchlive_{SUFFIX}", artist=True)
    admin_tok = register("admin-smoke@smoketest.example.com", "smoke_admin")

    boundary = "----slc"
    mp3 = b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\x00" * 512
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 128

    def upload(title, description=None):
        parts = [
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"title\"\r\n\r\n{title}\r\n".encode("latin-1")
        ]
        if description:
            parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"description\"\r\n\r\n{description}\r\n".encode("latin-1"))
        parts.append(b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"t.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n" + mp3 + b"\r\n")
        parts.append(b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"cover\"; filename=\"c.png\"\r\nContent-Type: image/png\r\n\r\n" + png + b"\r\n")
        parts.append(b"--" + boundary.encode() + b"--\r\n")
        up = urllib.request.Request(f"{BACKEND}/api/songs", method="POST")
        up.add_header("Authorization", f"Bearer {artist_tok}")
        up.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
        up.data = b"".join(parts)
        song = json.load(urllib.request.urlopen(up))
        with api(f"/api/admin/songs/{song['id']}/approve", {}, token=admin_tok) as r:
            assert json.load(r)["status"] == "APPROVED"
        return song

    # Match-type ladder for query "aurora":
    title_song = upload("Aurora Nights")                       # title match (+prefix)
    desc_song = upload("Midnight Vibes", description="inspired by aurora borealis")  # description only
    # a second artist whose NAME matches (their song title is unrelated)
    other_tok = register(f"aurora-sky-{SUFFIX}@smoketest.example.com", f"aurora_sky_{SUFFIX}", artist=True)
    other_up = urllib.request.Request(f"{BACKEND}/api/songs", method="POST")
    other_up.add_header("Authorization", f"Bearer {other_tok}")
    other_up.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    other_up.data = b"".join([
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"title\"\r\n\r\nCompletely Different Song\r\n".encode("latin-1"),
        b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"t.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n" + mp3 + b"\r\n",
        b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"cover\"; filename=\"c.png\"\r\nContent-Type: image/png\r\n\r\n" + png + b"\r\n",
        b"--" + boundary.encode() + b"--\r\n",
    ])
    other_song = json.load(urllib.request.urlopen(other_up))
    with api(f"/api/admin/songs/{other_song['id']}/approve", {}, token=admin_tok) as r:
        assert json.load(r)["status"] == "APPROVED"

    res = json.load(urllib.request.urlopen(f"{BACKEND}/api/search?q=aurora"))
    order = [(s["title"], s["artist_name"]) for s in res["songs"]]
    print("live /api/search?q=aurora order (title | artist):")
    for t, a in order:
        print(f"  {t!r} | {a}")

    ids = {s["title"]: s["id"] for s in res["songs"]}
    assert "Aurora Nights" in ids, "title match missing"
    assert "Completely Different Song" in ids, "artist-name match missing"
    assert "Midnight Vibes" in ids, "description match missing"
    titles_order = [t for t, _ in order]
    assert titles_order.index("Aurora Nights") < titles_order.index("Completely Different Song") < titles_order.index("Midnight Vibes"), (
        f"ranking wrong: {order}"
    )
    print("\nSEARCH RANKING LIVE CHECK: PASS — title > artist name > description")


if __name__ == "__main__":
    main()
