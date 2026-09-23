"""Live self-test for the Phase 3 license/rights workflow.

Upload -> PENDING license blocks download -> admin approve enables download
-> artist edit resets to PENDING -> reject/suspend/reinstate -> expiry gate.
Run: uv run python scripts/license3_live_check.py [backend-url]
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


def put(path, data, token):
    req = urllib.request.Request(f"{BACKEND}{path}", method="PUT")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    req.data = json.dumps(data).encode()
    return urllib.request.urlopen(req)


def pending_lic(admin_tok, sid):
    return next(
        l for l in json.load(request("/api/admin/licenses", token=admin_tok)) if l["song_id"] == sid
    )


def main():
    artist_tok = register(f"lic-live-{SUFFIX}@smoketest.example.com", f"lic_live_{SUFFIX}", artist=True)
    admin_tok = register("admin-smoke@smoketest.example.com", "smoke_admin")
    listener_tok = register(f"lic-l-{SUFFIX}@smoketest.example.com", f"lic_l_{SUFFIX}")

    boundary = "----anc"
    mp3 = b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\x00" * 512
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 128
    body = (
        b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"title\"\r\n\r\nLicense Live Song\r\n"
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
    sid = song["id"]

    check("new upload has PENDING license", song["license_status"] == "PENDING", song["license_status"])

    request(f"/api/admin/songs/{sid}/approve", {}, token=admin_tok)

    def dl_status():
        try:
            request(f"/api/songs/{sid}/download", {}, token=listener_tok)
            return 200
        except urllib.error.HTTPError as e:
            return e.code

    check("download blocked while license PENDING", dl_status() == 403)

    lic = pending_lic(admin_tok, sid)
    check("admin sees license in PENDING queue", lic["status"] == "PENDING" and lic["rights_holder"] is None)

    r = json.load(request(f"/api/admin/licenses/{lic['id']}/approve", {"note": "proof ok"}, token=admin_tok))
    check("admin approve -> APPROVED", r["status"] == "APPROVED")
    check("download allowed after approval", dl_status() == 200)

    # artist edits -> back to PENDING, download blocked again
    r = json.load(
        put(
            f"/api/songs/{sid}/license",
            {
                "license_type": "cc_by",
                "rights_holder": "Live Check Artist",
                "proof_reference": "https://example.com/proof",
            },
            artist_tok,
        )
    )
    check("artist edit resets to PENDING", r["status"] == "PENDING")
    check("download blocked after edit", dl_status() == 403)

    lic2 = pending_lic(admin_tok, sid)
    r = json.load(
        request(f"/api/admin/licenses/{lic2['id']}/reject", {"reason": "proof unreadable"}, token=admin_tok)
    )
    check("admin reject -> REJECTED", r["status"] == "REJECTED")
    check("download blocked after reject", dl_status() == 403)

    # re-approve, then suspend + reinstate cycle
    r = json.load(request(f"/api/admin/licenses/{lic2['id']}/approve", {}, token=admin_tok))
    check("re-approve works", r["status"] == "APPROVED")
    r = json.load(
        request(f"/api/admin/licenses/{lic2['id']}/suspend", {"reason": "dispute"}, token=admin_tok)
    )
    check("admin suspend -> SUSPENDED", r["status"] == "SUSPENDED")
    check("download blocked while suspended", dl_status() == 403)
    r = json.load(request(f"/api/admin/licenses/{lic2['id']}/reinstate", {}, token=admin_tok))
    check("admin reinstate -> APPROVED", r["status"] == "APPROVED")
    check("download allowed after reinstate", dl_status() == 200)

    # expiry: edit with past effective_until, approve -> blocked
    past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    put(
        f"/api/songs/{sid}/license",
        {"license_type": "artist_owned", "rights_holder": "Live Check Artist", "effective_until": past},
        artist_tok,
    )
    lic3 = pending_lic(admin_tok, sid)
    json.load(request(f"/api/admin/licenses/{lic3['id']}/approve", {}, token=admin_tok))
    song_now = json.load(request(f"/api/songs/{sid}", token=artist_tok))
    check("expired license reads EXPIRED", song_now["license_status"] == "EXPIRED", song_now["license_status"])
    check("download blocked for expired license", dl_status() == 403)

    # non-owner cannot read license
    code = None
    try:
        request(f"/api/songs/{sid}/license", token=listener_tok)
    except urllib.error.HTTPError as e:
        code = e.code
    check("non-owner license read blocked (403)", code == 403, str(code))

    # artist got license notifications
    notes = json.load(request("/api/notifications", token=artist_tok))["notifications"]
    types = {n["type"] for n in notes}
    check(
        "license notifications delivered",
        "license_rejected" in types and "license_approved" in types,
        str(types),
    )

    passed = sum(results)
    print(f"\nLICENSE3 LIVE CHECK: {passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()