"""Live self-test for the Phase 3.4 background worker.

Uploads a real WAV, verifies duration starts at 0 (probe moved off the
request thread), waits for the in-process worker to run the probe job,
then exercises the license sweep against live data.
Run: uv run python scripts/jobs4_live_check.py [backend-url]
"""
import asyncio
import json
import struct
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


def wav_bytes(seconds=3, rate=8000):
    """Real WAV header so ffprobe/header parsing reads an exact duration."""
    data_size = int(seconds * rate) * 2
    fmt = struct.pack("<HHIIHH", 1, 1, rate, rate * 2, 2, 16)
    header = b"RIFF" + struct.pack("<I", 36 + data_size) + b"WAVE"
    header += b"fmt " + struct.pack("<I", 16) + fmt
    header += b"data" + struct.pack("<I", data_size)
    return header + b"\x00" * data_size


def pending_lic(admin_tok, sid):
    return next(
        l for l in json.load(request("/api/admin/licenses", token=admin_tok)) if l["song_id"] == sid
    )


def put(path, data, token):
    req = urllib.request.Request(f"{BACKEND}{path}", method="PUT")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    req.data = json.dumps(data).encode()
    return urllib.request.urlopen(req)


def main():
    artist_tok = register(f"job-live-{SUFFIX}@smoketest.example.com", f"job_live_{SUFFIX}", artist=True)
    admin_tok = register("admin-smoke@smoketest.example.com", "smoke_admin")

    wav = wav_bytes(3)
    boundary = "----anc"
    body = (
        b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"title\"\r\n\r\nWorker Live Song\r\n"
        + b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"t.wav\"\r\nContent-Type: audio/wav\r\n\r\n" + wav + b"\r\n"
        + b"--" + boundary.encode() + b"\r\nContent-Disposition: form-data; name=\"cover\"; filename=\"c.png\"\r\nContent-Type: image/png\r\n\r\n" + b"\x89PNG\r\n\x1a\n" + b"\x00" * 128 + b"\r\n"
        + b"--" + boundary.encode() + b"--\r\n"
    )
    up = urllib.request.Request(f"{BACKEND}/api/songs", method="POST")
    up.add_header("Authorization", f"Bearer {artist_tok}")
    up.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    up.data = body
    song = json.load(urllib.request.urlopen(up))
    sid = song["id"]

    check("duration_sec == 0 right after upload (probe off request thread)", song["duration_sec"] == 0, str(song["duration_sec"]))

    # wait for the in-process worker to run the probe job (polls every ~2s)
    deadline = time.time() + 30
    probe = None
    done = False
    while time.time() < deadline:
        jobs = json.load(request("/api/admin/jobs", token=admin_tok))
        probe = next(
            (j for j in jobs if j["type"] == "probe_upload" and j["payload"].get("song_id") == sid),
            None,
        )
        if probe and probe["status"] == "DONE":
            done = True
            break
        time.sleep(1.5)
    check("worker processed probe_upload job", done)
    if probe:
        check("probe job attempts == 1", probe["attempts"] == 1, str(probe["attempts"]))

    request(f"/api/admin/songs/{sid}/approve", {}, token=admin_tok)  # make it publicly readable

    refreshed = json.load(request(f"/api/songs/{sid}", token=artist_tok))
    check("duration populated by worker (~3s)", 2 <= refreshed["duration_sec"] <= 5, str(refreshed["duration_sec"]))
    check("sample_rate populated", refreshed["sample_rate"] == 8000, str(refreshed["sample_rate"]))

    # license sweep against live data: past-due APPROVED license -> EXPIRED
    past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    put(
        f"/api/songs/{sid}/license",
        {"license_type": "artist_owned", "rights_holder": "Live Artist", "effective_until": past},
        artist_tok,
    )
    lic = pending_lic(admin_tok, sid)
    json.load(request(f"/api/admin/licenses/{lic['id']}/approve", {}, token=admin_tok))

    async def sweep():
        from app.core.database import AsyncSessionLocal

        from app.services.license_service import expire_due_licenses

        async with AsyncSessionLocal() as db:
            return await expire_due_licenses(db)

    expired = asyncio.run(sweep())
    check("license sweep expired >= 1 license", expired >= 1, str(expired))
    after = json.load(request(f"/api/songs/{sid}", token=artist_tok))
    check("license now EXPIRED", after["license_status"] == "EXPIRED", str(after["license_status"]))

    passed = sum(results)
    print(f"\nJOBS4 LIVE CHECK: {passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()