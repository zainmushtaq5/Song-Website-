"""Live self-test for the Phase 4 recommendation engine.

Real uploads across genres, real likes/plays, then asserts personalized
ordering, exclusions, and artist suggestions on the live backend.
Run: uv run python scripts/recommendations_live_check.py [backend-url]
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

results = []


def check(label, cond, extra=""):
    results.append(cond)
    print(f"[{'PASS' if cond else 'FAIL'}] {label}" + (f" -> {extra}" if not cond else ""))


def request(path, data=None, token=None, method=None):
    req = urllib.request.Request(
        f"{BACKEND}{path}", method=method or ("POST" if data is not None else "GET")
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
        with request("/api/auth/register", body) as r:
            return json.load(r)["access_token"]
    except urllib.error.HTTPError as e:
        if e.code == 409:
            with request("/api/auth/login", {"email": email, "password": "password123"}) as r:
                return json.load(r)["access_token"]
        raise


def upload(tok, admin_tok, title, genre=None):
    boundary = "----anc"
    mp3 = b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\x00" * 512
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 128
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"title\"\r\n\r\n{title}\r\n".encode("latin-1")
        + (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"genre\"\r\n\r\n{genre}\r\n".encode("latin-1")
            if genre
            else b""
        )
        + b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"t.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n" + mp3 + b"\r\n"
        + b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"cover\"; filename=\"c.png\"\r\nContent-Type: image/png\r\n\r\n" + png + b"\r\n"
        + b"--" + boundary.encode() + b"--\r\n"
    )
    up = urllib.request.Request(f"{BACKEND}/api/songs", method="POST")
    up.add_header("Authorization", f"Bearer {tok}")
    up.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    up.data = body
    song = json.load(urllib.request.urlopen(up))
    request(f"/api/admin/songs/{song['id']}/approve", {}, token=admin_tok)
    return song


def main():
    a1 = register(f"rec-a1-{SUFFIX}@rec.example.com", f"rec_a1_{SUFFIX}", artist=True)
    a2 = register(f"rec-a2-{SUFFIX}@rec.example.com", f"rec_a2_{SUFFIX}", artist=True)
    admin = register("admin-smoke@smoketest.example.com", "smoke_admin")
    listener = register(f"rec-l-{SUFFIX}@rec.example.com", f"rec_l_{SUFFIX}")

    pop1 = upload(a1, admin, "Rec Pop One (L1)", genre="Synthwave")
    pop2 = upload(a2, admin, "Rec Pop Two (L1)", genre="Synthwave")
    jazz = upload(a2, admin, "Rec Jazz One (L1)", genre="Jazz")

    # listener's taste: likes the Synthwave song by a1, plays the Jazz song
    request(f"/api/songs/{pop1['id']}/like", {}, token=listener)
    for _ in range(2):
        request(f"/api/songs/{jazz['id']}/play", {}, token=listener)

    recs = json.load(request("/api/recommendations", token=listener))
    titles = [s["title"] for s in recs["songs"]]
    print(json.dumps({"titles": titles, "artists": [a["name"] for a in recs["artists"]]}, indent=2)[:600])

    check("anon endpoint works (popular mix)", len(json.load(request("/api/recommendations"))["songs"]) >= 3)
    check("top pick is the same-genre song", titles[0] == "Rec Pop Two (L1)", str(titles[:2]))
    check("liked song excluded", "Rec Pop One (L1)" not in titles, str(titles))
    check("played song excluded", "Rec Jazz One (L1)" not in titles, str(titles))
    check(
        "artist suggestion present (a2 makes Synthwave + Jazz music)",
        any(a["slug"].startswith("rec-a2_") or "rec-a2" in a["slug"] for a in recs["artists"]),
        str([a["slug"] for a in recs["artists"]]),
    )
    check(
        "own songs excluded for artists",
        "Rec Pop One (L1)" not in [s["title"] for s in json.load(request("/api/recommendations", token=a1))["songs"]],
    )

    passed = sum(results)
    print(f"\nRECOMMENDATIONS LIVE CHECK: {passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()