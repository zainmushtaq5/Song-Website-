"""Background job queue tests: enqueue on upload, probe handler, license
sweep, retry/failed, admin visibility, RBAC.

Kept sync: DB coroutines run on their own loop/session via asyncio.run
(pytest-asyncio loop handling on Windows is fragile here).
"""

import asyncio
import json
import uuid
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import select

from app.models.job import Job, JobStatus, JobType
from app.services import job_service
from tests.conftest import MP3_BYTES, PNG_BYTES, _TestSession


def _upload(client, auth_headers, title="Worker Song"):
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    r = client.post("/api/songs", data={"title": title}, files=files, headers=auth_headers)
    assert r.status_code == 201, r.text
    return r.json()


def _run_db(coro_fn):
    """Run a DB coroutine on its own loop + session (same engine as the app)."""

    async def runner():
        async with _TestSession() as session:
            result = await coro_fn(session)
            await session.commit()
            return result

    return asyncio.run(runner())


def _get_job(job_id):
    async def fn(session):
        return (await session.execute(select(Job).where(Job.id == job_id))).scalar_one()

    return _run_db(fn)


def test_upload_enqueues_probe_job_and_song_has_zero_duration(client, auth_headers) -> None:
    song = _upload(client, auth_headers)
    assert song["duration_sec"] == 0  # metadata comes from the worker now

    async def query(session):
        return (await session.execute(select(Job).where(Job.type == JobType.PROBE_UPLOAD))).scalars().all()

    jobs = _run_db(query)
    assert len(jobs) == 1
    assert jobs[0].status == JobStatus.PENDING
    assert json.loads(jobs[0].payload)["song_id"] == song["id"]


def test_worker_processes_probe_upload(client, auth_headers, admin_headers) -> None:
    song = _upload(client, auth_headers)

    async def probe_id(session):
        job = (
            await session.execute(
                select(Job).where(Job.type == JobType.PROBE_UPLOAD, Job.payload.contains(song["id"]))
            )
        ).scalars().first()
        return str(job.id)

    probe_job_id = _run_db(probe_id)

    async def run(session):
        return await job_service.run_pending_jobs(session, limit=10)

    ran = _run_db(run)
    assert ran >= 1

    probe = _get_job(uuid.UUID(probe_job_id))
    assert probe.status == JobStatus.DONE
    assert probe.attempts == 1

    # admin sees the DONE job through the API
    jobs = client.get("/api/admin/jobs?job_status=DONE", headers=admin_headers).json()
    assert any(j["id"] == probe_job_id for j in jobs)


def test_license_sweep_expires_and_blocks_downloads(client, auth_headers, admin_headers, user_headers) -> None:
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    song = client.post(
        "/api/songs",
        data={"title": "Sweep Song", "download_allowed": "true", "license_type": "artist_owned"},
        files=files,
        headers=auth_headers,
    ).json()
    client.post(f"/api/admin/songs/{song['id']}/approve", headers=admin_headers)

    # approve license with a past effective_until (set via artist edit)
    past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    r = client.put(
        f"/api/songs/{song['id']}/license",
        headers=auth_headers,
        json={"license_type": "artist_owned", "rights_holder": "A", "effective_until": past},
    )
    assert r.status_code == 200
    lic = next(
        l for l in client.get("/api/admin/licenses", headers=admin_headers).json() if l["song_id"] == song["id"]
    )
    r = client.post(f"/api/admin/licenses/{lic['id']}/approve", headers=admin_headers, json={})
    assert r.status_code == 200

    async def sweep(session):
        await job_service.enqueue(session, JobType.LICENSE_SWEEP)
        await session.commit()
        return await job_service.run_pending_jobs(session, limit=10)

    ran = _run_db(sweep)
    assert ran >= 1

    body = client.get(f"/api/songs/{song['id']}", headers=auth_headers).json()
    assert body["license_status"] == "EXPIRED"
    assert client.post(f"/api/songs/{song['id']}/download", headers=user_headers).status_code == 403

    jobs = client.get("/api/admin/jobs?job_status=DONE", headers=admin_headers).json()
    assert any(j["type"] == "license_sweep" for j in jobs)


def test_failed_job_retries_then_marks_failed_with_error(client, admin_headers) -> None:
    from app.core.config import settings as app_settings

    async def enqueue_bad(session):
        return await job_service.enqueue(
            session, JobType.PROBE_UPLOAD, {"song_id": str(uuid4()), "audio_key": "audio/none.mp3"}
        )

    job_id = str(_run_db(enqueue_bad).id)

    async def run(session):
        return await job_service.run_pending_jobs(session, limit=5)

    _run_db(run)
    job = _get_job(uuid.UUID(job_id))
    # attempt 1 failed -> scheduled for retry (PENDING with backoff), error recorded
    assert job.status == JobStatus.PENDING
    assert job.attempts == 1
    assert job.last_error is not None
    assert job.run_at is not None

    # exhaust retries: pretend attempts are at the last one and make it due now
    async def bump(session):
        job = (await session.execute(select(Job).where(Job.id == uuid.UUID(job_id)))).scalar_one()
        job.attempts = app_settings.JOB_MAX_ATTEMPTS - 1
        job.run_at = None

    _run_db(bump)
    _run_db(run)
    job = _get_job(uuid.UUID(job_id))
    assert job.status == JobStatus.FAILED
    assert job.last_error is not None
    assert job.attempts >= app_settings.JOB_MAX_ATTEMPTS

    jobs = client.get("/api/admin/jobs?job_status=FAILED", headers=admin_headers).json()
    assert any(j["id"] == job_id for j in jobs)


def test_admin_jobs_rbac_and_filters(client, admin_headers, auth_headers) -> None:
    assert client.get("/api/admin/jobs", headers=auth_headers).status_code == 403
    assert client.get("/api/admin/jobs?job_status=BOGUS", headers=admin_headers).status_code == 422
    body = client.get("/api/admin/jobs", headers=admin_headers)
    assert body.status_code == 200
    assert isinstance(body.json(), list)