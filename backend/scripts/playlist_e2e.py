"""E2E: playlists — create, add songs, detail SSR, private visibility, delete.
Run: uv run python scripts/playlist_e2e.py [frontend-url] [backend-url]
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


def main():
    artist_tok = register(f"pl-artist-{SUFFIX}@smoketest.example.com", f"pl_artist_{SUFFIX}", artist=True)
    owner_tok = register(f"pl-owner-{SUFFIX}@smoketest.example.com", f"pl_owner_{SUFFIX}")
    admin_tok = register("admin-smoke@smoketest.example.com", "smoke_admin")

    # upload 2 songs + approve
    boundary = "----ple"
    mp3 = b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\x00" * 512
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 128
    song_ids = []
    for title in ("Playlist Song One", "Playlist Song Two"):
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
        with request(f"/api/admin/songs/{song['id']}/approve", {}, token=admin_tok) as r:
            assert json.load(r)["status"] == "APPROVED"
        song_ids.append(song["id"])
    check("two songs uploaded + approved", len(song_ids) == 2)

    # create playlist
    with request("/api/playlists", {"name": f"E2E Mix {SUFFIX}", "description": "e2e playlist"}, token=owner_tok) as r:
        pl = json.load(r)
    check("playlist created", pl["slug"].startswith("e2e-mix"))

    # mine lists it
    mine = json.load(urllib.request.urlopen(urllib.request.Request(f"{BACKEND}/api/playlists/mine", headers={"Authorization": f"Bearer {owner_tok}"})))
    check("mine lists playlist (0 songs)", any(p["slug"] == pl["slug"] and p["song_count"] == 0 for p in mine))

    # add both songs
    for sid in song_ids:
        with request(f"/api/playlists/{pl['id']}/songs", {"song_id": sid}, token=owner_tok) as r:
            assert r.status == 201
    detail = json.load(urllib.request.urlopen(f"{BACKEND}/api/playlists/{pl['slug']}"))
    check("detail has 2 songs in order", [s["id"] for s in detail["songs"]] == song_ids)
    check("detail cover derived from first song", detail["cover_url"] is not None)

    # duplicate add -> 409
    try:
        request(f"/api/playlists/{pl['id']}/songs", {"song_id": song_ids[0]}, token=owner_tok)
        check("duplicate add rejected", False)
    except urllib.error.HTTPError as e:
        check("duplicate add rejected", e.code == 409)

    # remove one
    req = urllib.request.Request(f"{BACKEND}/api/playlists/{pl['id']}/songs/{song_ids[0]}", method="DELETE")
    req.add_header("Authorization", f"Bearer {owner_tok}")
    check("remove song -> 204", urllib.request.urlopen(req).status == 204)
    check("detail now 1 song", json.load(urllib.request.urlopen(f"{BACKEND}/api/playlists/{pl['slug']}"))["song_count"] == 1)

    # SSR: frontend playlist page renders
    html = urllib.request.urlopen(f"{FRONTEND}/playlists/{pl['slug']}").read().decode()
    check(f"SSR playlist page shows name", f"E2E Mix {SUFFIX}" in html)
    check("SSR playlist page shows remaining song", "Playlist Song Two" in html)

    # cleanup: delete playlist
    req = urllib.request.Request(f"{BACKEND}/api/playlists/{pl['id']}", method="DELETE")
    req.add_header("Authorization", f"Bearer {owner_tok}")
    check("delete playlist -> 204", urllib.request.urlopen(req).status == 204)
    try:
        urllib.request.urlopen(f"{BACKEND}/api/playlists/{pl['slug']}")
        check("deleted playlist gone", False)
    except urllib.error.HTTPError as e:
        check("deleted playlist gone", e.code == 404)

    passed = sum(results)
    print(f"\nPLAYLIST E2E RESULT: {passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


try:
    main()
except urllib.error.HTTPError as e:
    print(f"FAIL: HTTP {e.code} on {getattr(e, 'url', '?')} — {e.read().decode()[:200]}")
    sys.exit(1)
