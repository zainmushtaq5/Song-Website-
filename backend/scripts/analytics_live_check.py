"""Live self-test for artist analytics against the running backend.

Uploads a song, generates real activity (plays/download/like via API),
then prints GET /api/users/me/analytics and asserts the numbers.
Run: uv run python scripts/analytics_live_check.py [backend-url]
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


def request(path, data=None, token=None):
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
        with request("/api/auth/register", body) as r:
            return json.load(r)["access_token"]
    except urllib.error.HTTPError as e:
        if e.code == 409:
            with request("/api/auth/login", {"email": email, "password": "password123"}) as r:
                return json.load(r)["access_token"]
        raise


def main():
    artist_tok = register(f"an-live-{SUFFIX}@smoketest.example.com", f"an_live_{SUFFIX}", artist=True)
    admin_tok = register("admin-smoke@smoketest.example.com", "smoke_admin")
    listener_tok = register(f"an-listener-{SUFFIX}@smoketest.example.com", f"an_listener_{SUFFIX}")

    boundary = "----anc"
    mp3 = b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\x00" * 512
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 128
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"title\"\r\n\r\nAnalytics Song\r\n".encode("latin-1")
        + b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"download_allowed\"\r\n\r\ntrue\r\n"
        + b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"license_type\"\r\n\r\nartist_owned\r\n"
        + b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"t.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n" + mp3 + b"\r\n"
        + b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"cover\"; filename=\"c.png\"\r\nContent-Type: image/png\r\n\r\n" + png + b"\r\n"
        + b"--" + boundary.encode() + b"--\r\n"
    )
    up = urllib.request.Request(f"{BACKEND}/api/songs", method="POST")
    up.add_header("Authorization", f"Bearer {artist_tok}")
    up.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    up.data = body
    song = json.load(urllib.request.urlopen(up))
    with request(f"/api/admin/songs/{song['id']}/approve", {}, token=admin_tok) as r:
        assert json.load(r)["status"] == "APPROVED"

    # real activity: 3 plays, 1 download, 1 like
    for _ in range(3):
        request(f"/api/songs/{song['id']}/play", {})
    request(f"/api/songs/{song['id']}/download", {}, token=listener_tok)
    request(f"/api/songs/{song['id']}/like", {}, token=listener_tok)

    body = json.load(
        urllib.request.urlopen(
            urllib.request.Request(f"{BACKEND}/api/users/me/analytics", headers={"Authorization": f"Bearer {artist_tok}"})
        )
    )
    print(json.dumps(body, indent=2, default=str))

    check("song_count == 1", body["song_count"] == 1)
    check("totals plays == 3", body["totals"]["plays"] == 3, str(body["totals"]))
    check("totals downloads == 1", body["totals"]["downloads"] == 1)
    check("totals likes == 1", body["totals"]["likes"] == 1)
    check("last_7_days plays == 3", body["last_7_days"]["plays"] == 3)
    check("top_songs ordered", body["top_songs"][0]["title"] == "Analytics Song")

    passed = sum(results)
    print(f"\nANALYTICS LIVE CHECK: {passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
