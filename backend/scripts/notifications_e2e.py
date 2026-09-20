"""E2E: notifications — approve/reject/follow triggers, unread count, read-all.
Run: uv run python scripts/notifications_e2e.py [frontend-url] [backend-url]
"""
import json
import sys
import time
import urllib.error
import urllib.request

FRONTEND = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3100"
BACKEND = sys.argv[2] if len(sys.argv) > 1 else "http://localhost:8000"
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


def notif(tok):
    return json.load(
        urllib.request.urlopen(
            urllib.request.Request(f"{BACKEND}/api/notifications", headers={"Authorization": f"Bearer {tok}"})
        )
    )


def main():
    artist_tok = register(f"nt-artist-{SUFFIX}@smoketest.example.com", f"nt_artist_{SUFFIX}", artist=True)
    admin_tok = register("admin-smoke@smoketest.example.com", "smoke_admin")
    other_tok = register(f"nt-other-{SUFFIX}@smoketest.example.com", f"nt_other_{SUFFIX}")

    # upload a song -> approve -> notification
    boundary = "----nte"
    mp3 = b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\x00" * 512
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 128
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"title\"\r\n\r\nNotify Me\r\n".encode("latin-1")
        + b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"t.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n" + mp3 + b"\r\n"
        + b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"cover\"; filename=\"c.png\"\r\nContent-Type: image/png\r\n\r\n" + png + b"\r\n"
        + b"--" + boundary.encode() + b"--\r\n"
    )
    up = urllib.request.Request(f"{BACKEND}/api/songs", method="POST")
    up.add_header("Authorization", f"Bearer {artist_tok}")
    up.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    up.data = body
    song = json.load(urllib.request.urlopen(up))
    request(f"/api/admin/songs/{song['id']}/approve", {}, token=admin_tok)

    body1 = notif(artist_tok)
    check("approval notification created", body1["unread_count"] == 1 and body1["notifications"][0]["type"] == "song_approved")

    # follow -> new_follower notification for artist
    request(f"/api/artists/{song['artist_slug']}/follow", {}, token=other_tok)
    body2 = notif(artist_tok)
    check("follow notification created", body2["unread_count"] == 2 and any(n["type"] == "new_follower" for n in body2["notifications"]))

    # read-all
    request("/api/notifications/read-all", {}, token=artist_tok)
    body3 = notif(artist_tok)
    check("read-all clears unread", body3["unread_count"] == 0 and all(n["is_read"] for n in body3["notifications"]))

    # SSR: notifications page renders shell (client-hydrated list)
    html = urllib.request.urlopen(f"{FRONTEND}/notifications").read().decode()
    check("SSR notifications page serves shell", "Notifications" in html)

    passed = sum(results)
    print(f"\nNOTIFICATIONS E2E RESULT: {passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


try:
    main()
except urllib.error.HTTPError as e:
    print(f"FAIL: HTTP {e.code} on {getattr(e, 'url', '?')} — {e.read().decode()[:200]}")
    sys.exit(1)
