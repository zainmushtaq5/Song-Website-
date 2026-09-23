"""Live self-test for Phase 3 analytics: 7/30/90-day series + per-song drilldown.

Uploads songs, generates real activity, then asserts the new series/window
fields on GET /api/users/me/analytics and the drilldown endpoint.
Run: uv run python scripts/analytics3_live_check.py [backend-url]
"""
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime, timedelta
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


def multipart_song(artist_tok, title, dl=False):
    boundary = "----anc"
    mp3 = b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\x00" * 512
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 128
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"title\"\r\n\r\n{title}\r\n".encode("latin-1")
        + (b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"download_allowed\"\r\n\r\ntrue\r\n" if dl else b"")
        + (b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"license_type\"\r\n\r\nartist_owned\r\n" if dl else b"")
        + b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"t.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n" + mp3 + b"\r\n"
        + b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"cover\"; filename=\"c.png\"\r\nContent-Type: image/png\r\n\r\n" + png + b"\r\n"
        + b"--" + boundary.encode() + b"--\r\n"
    )
    up = urllib.request.Request(f"{BACKEND}/api/songs", method="POST")
    up.add_header("Authorization", f"Bearer {artist_tok}")
    up.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    up.data = body
    return up


def main():
    artist_tok = register(f"a3-live-{SUFFIX}@smoketest.example.com", f"a3_live_{SUFFIX}", artist=True)
    admin_tok = register("admin-smoke@smoketest.example.com", "smoke_admin")
    listener_tok = register(f"a3-l-{SUFFIX}@smoketest.example.com", f"a3_l_{SUFFIX}")

    up = multipart_song(artist_tok, "A3 Series Song", dl=True)
    song = json.load(urllib.request.urlopen(up))
    with request(f"/api/admin/songs/{song['id']}/approve", {}, token=admin_tok) as r:
        assert json.load(r)["status"] == "APPROVED"

    for _ in range(3):
        request(f"/api/songs/{song['id']}/play", {})
    request(f"/api/songs/{song['id']}/download", {}, token=listener_tok)
    request(f"/api/songs/{song['id']}/like", {}, token=listener_tok)

    def get(path):
        return json.load(
            urllib.request.urlopen(
                urllib.request.Request(f"{BACKEND}{path}", headers={"Authorization": f"Bearer {artist_tok}"})
            )
        )

    body7 = get("/api/users/me/analytics?window=7")
    print(json.dumps(body7, indent=2, default=str)[:1200])

    check("window echoed == 7", body7["window"] == 7)
    check("series has 7 points", len(body7["series"]) == 7)
    today = datetime.now(UTC).date()
    check("series ends today (UTC)", body7["series"][-1]["date"] == today.isoformat(), body7["series"][-1]["date"])
    check(
        "dates contiguous ascending",
        [d["date"] for d in body7["series"]] == [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)],
    )
    last = body7["series"][-1]
    check(
        "today bucket: plays=3 likes=1 downloads=1",
        (last["plays"], last["likes"], last["downloads"]) == (3, 1, 1),
        str(last),
    )
    check(
        "series plays sum == last_7_days plays",
        sum(d["plays"] for d in body7["series"]) == body7["last_7_days"]["plays"],
    )

    body90 = get("/api/users/me/analytics?window=90")
    check("series has 90 points", len(body90["series"]) == 90)
    check(
        "90d series sums match 7d sums",
        sum(d["plays"] for d in body90["series"]) == sum(d["plays"] for d in body7["series"]),
    )

    for bad in ("8", "0", "91"):
        code = None
        try:
            get(f"/api/users/me/analytics?window={bad}")
        except urllib.error.HTTPError as e:
            code = e.code
        check(f"window={bad} rejected with 422", code == 422, str(code))

    drill = get(f"/api/users/me/analytics/songs/{song['id']}?window=7")
    check("drilldown song id matches", drill["song"]["id"] == song["id"])
    check("drilldown title matches", drill["song"]["title"] == "A3 Series Song")
    check("drilldown totals plays == 3", drill["totals"]["plays"] == 3, str(drill["totals"]))
    check("drilldown series 7 points", len(drill["series"]) == 7)
    check("drilldown last bucket plays == 3", drill["series"][-1]["plays"] == 3)

    code = None
    try:
        request(f"/api/users/me/analytics/songs/{song['id']}", token=listener_tok)
    except urllib.error.HTTPError as e:
        code = e.code
    check("drilldown blocked for non-owner (403)", code == 403, str(code))

    passed = sum(results)
    print(f"\nANALYTICS3 LIVE CHECK: {passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()