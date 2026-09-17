"""E2E: follow feature — register artist + listener, upload, approve, follow, verify SSR."""
import json
import sys
import time
import urllib.error
import urllib.request

FRONTEND = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
BACKEND = sys.argv[2] if len(sys.argv) > 1 else "http://localhost:8000"
SUFFIX = str(int(time.time() * 1000) % 100000000)

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
        if e.code == 409:  # already exists (e.g. the seeded admin) -> log in
            with request("/api/auth/login", {"email": email, "password": "password123"}) as r:
                return json.load(r)["access_token"]
        raise


def main():
    artist_tok = register(f"fa-artist-{SUFFIX}@smoketest.example.com", f"follow_artist_{SUFFIX}", artist=True)
    listener_tok = register(f"fa-listener-{SUFFIX}@smoketest.example.com", f"follow_user_{SUFFIX}")

    # artist uploads + admin approves (admin from existing seed)
    boundary = "----e2e"
    png_head = b"\x89PNG\r\n\x1a\n"
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"title\"\r\n\r\nFollow E2E Song\r\n"
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"download_allowed\"\r\n\r\nfalse\r\n"
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"t.mp3\"\r\n"
        f"Content-Type: audio/mpeg\r\n\r\n".encode("latin-1")
        + b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\x00" * 512 + b"\r\n"
        + f"--{boundary}\r\nContent-Disposition: form-data; name=\"cover\"; filename=\"c.png\"\r\n".encode("latin-1")
        + b"Content-Type: image/png\r\n\r\n" + png_head + b"\x00" * 128 + b"\r\n"
        + f"--{boundary}--\r\n".encode("latin-1")
    )
    up = urllib.request.Request(f"{BACKEND}/api/songs", method="POST")
    up.add_header("Authorization", f"Bearer {artist_tok}")
    up.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    up.data = body if isinstance(body, bytes) else body.encode("latin-1")
    song = json.load(urllib.request.urlopen(up))
    check("upload ok", song["status"] == "PENDING")

    # approve as admin
    adm = register("admin-smoke@smoketest.example.com", "smoke_admin")
    with request(f"/api/admin/songs/{song['id']}/approve", {}, token=adm) as r:
        check("approve ok", json.load(r)["status"] == "APPROVED")

    slug = song["artist_slug"]
    artist_id = song["artist_id"]

    # anon artist page: follower_count 0, no is_following
    page = json.load(urllib.request.urlopen(f"{BACKEND}/api/artists/{slug}"))
    check("anon follower_count == 0", page["follower_count"] == 0)

    # listener follows
    with request(f"/api/artists/{slug}/follow", {}, token=listener_tok) as r:
        check("follow -> true", json.load(r)["following"] is True)
    page = json.load(urllib.request.urlopen(f"{BACKEND}/api/artists/{slug}"))
    check("follower_count == 1", page["follower_count"] == 1)

    # authed artist page shows is_following for the follower
    req = urllib.request.Request(f"{BACKEND}/api/artists/{slug}")
    req.add_header("Authorization", f"Bearer {listener_tok}")
    check("is_following true for follower", json.load(urllib.request.urlopen(req))["is_following"] is True)

    # following list
    following = json.load(
        urllib.request.urlopen(urllib.request.Request(f"{BACKEND}/api/users/me/following", headers={"Authorization": f"Bearer {listener_tok}"}))
    )
    check("following list has artist", any(a["slug"] == slug for a in following))

    # unfollow
    with request(f"/api/artists/{slug}/follow", {}, token=listener_tok) as r:
        check("unfollow -> false", json.load(r)["following"] is False)
    check("follower_count back to 0", json.load(urllib.request.urlopen(f"{BACKEND}/api/artists/{slug}"))["follower_count"] == 0)

    # SSR: frontend artist page renders follower count + Follow button
    import urllib.request as ur
    html = ur.urlopen(f"{FRONTEND}/artists/{slug}").read().decode()
    check("SSR artist page shows 'follower'", "follower" in html)
    check("SSR artist page shows Follow button", "Follow" in html)

    passed = sum(results)
    print(f"\nFOLLOW E2E RESULT: {passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


try:
    main()
except urllib.error.HTTPError as e:
    print(f"FAIL: HTTP {e.code} — {e.read().decode()[:200]}")
    sys.exit(1)
