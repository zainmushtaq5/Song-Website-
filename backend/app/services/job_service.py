"""Durable background job queue (in-process asyncio worker).

Jobs live in the `jobs` table so the queue survives restarts and is
inspectable via GET /admin/jobs. The worker polls the table, claims one
PENDING job at a time, and runs its handler. Failures retry up to
JOB_MAX_ATTEMPTS, then the job is marked FAILED with the last error.

Handlers:
  probe_upload    — FFmpeg/ffprobe metadata extraction, moved off the
                    upload request thread (Phase 3.4)
  license_sweep   — periodically expires APPROVED licenses past
                    effective_until (disables downloads)
"""

import asyncio
import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.job import Job, JobStatus, JobType

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


async def enqueue(db: AsyncSession, job_type: JobType, payload: dict[str, Any] | None = None, run_at: datetime | None = None) -> Job:
    job = Job(
        type=job_type,
        status=JobStatus.PENDING,
        payload=json.dumps(payload or {}),
        run_at=run_at,
    )
    db.add(job)
    await db.flush()
    return job


async def _claim_next(db: AsyncSession) -> Job | None:
    now = _now()
    result = await db.execute(
        select(Job)
        .where(Job.status == JobStatus.PENDING, (Job.run_at.is_(None)) | (Job.run_at <= now))
        .order_by(Job.created_at)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    job = result.scalar_one_or_none()
    if job is None:
        return None
    job.status = JobStatus.PROCESSING
    job.attempts += 1
    await db.flush()
    return job


async def _handle_probe_upload(db: AsyncSession, payload: dict) -> dict:
    from uuid import UUID

    from app.models.song import Song
    from app.services.storage_service import storage
    from app.utils.audio import probe_duration

    song_id = UUID(str(payload.get("song_id")))
    audio_key = payload.get("audio_key")
    song = await db.get(Song, song_id)
    if song is None or song.deleted_at is not None:
        raise ValueError(f"song {song_id} not found for probe_upload")
    data = storage.read_bytes(audio_key) if audio_key else b""
    duration, bitrate, sample_rate = probe_duration(data)
    if duration is not None:
        song.duration_sec = duration
    song.bitrate_kbps = bitrate
    song.sample_rate = sample_rate
    await db.flush()
    return {"song_id": str(song.id), "duration_sec": song.duration_sec}


async def _handle_license_sweep(db: AsyncSession, payload: dict) -> dict:
    from app.services.license_service import expire_due_licenses

    expired = await expire_due_licenses(db)
    return {"expired": expired}


_HANDLERS = {
    JobType.PROBE_UPLOAD: _handle_probe_upload,
    JobType.LICENSE_SWEEP: _handle_license_sweep,
}


async def _finish(db: AsyncSession, job: Job, ok: bool, result: dict | None = None, error: str | None = None) -> None:
    if ok:
        job.status = JobStatus.DONE
        job.last_error = None
    elif job.attempts >= settings.JOB_MAX_ATTEMPTS:
        job.status = JobStatus.FAILED
        job.last_error = (error or "unknown error")[:2000]
    else:
        # retry with linear backoff
        job.status = JobStatus.PENDING
        job.run_at = _now() + timedelta(seconds=settings.JOB_POLL_SECONDS * job.attempts)
        job.last_error = (error or "unknown error")[:2000]
    job.finished_at = _now()
    await db.flush()


async def process_next_job(db: AsyncSession) -> Job | None:
    """Claim and run one pending job. Returns the job (or None if queue empty)."""
    job = await _claim_next(db)
    if job is None:
        return None
    handler = _HANDLERS.get(job.type)
    try:
        if handler is None:
            raise ValueError(f"no handler for job type {job.type}")
        payload = json.loads(job.payload or "{}")
        result = await handler(db, payload)
        await _finish(db, job, ok=True, result=result)
    except Exception as exc:  # noqa: BLE001 — worker must survive any handler error
        logger.warning("job %s (%s) attempt %s failed: %s", job.id, job.type, job.attempts, exc)
        job_id = job.id
        attempts = job.attempts  # capture before rollback (instance expires)
        await db.rollback()
        # re-fetch after rollback so the session is consistent
        job = await db.get(Job, job_id)
        job.attempts = max(job.attempts, attempts)  # the increment was rolled back
        await _finish(db, job, ok=False, error=str(exc))
        await db.commit()
    return job


async def run_pending_jobs(db: AsyncSession, limit: int = 20) -> int:
    """Drain the queue (used by tests and by the worker loop)."""
    ran = 0
    while ran < limit:
        job = await process_next_job(db)
        if job is None or job.status not in (JobStatus.DONE, JobStatus.FAILED):
            break
        ran += 1
    return ran


async def worker_loop() -> None:
    """Standalone poll loop: runs in-process at app startup, or via `python -m app.worker`.

    Also enqueues a license_sweep on an interval so expiry never depends on
    anyone remembering to schedule it.
    """
    from app.core.database import AsyncSessionLocal

    logger.info("background worker started (poll=%ss)", settings.JOB_POLL_SECONDS)
    last_sweep = 0.0
    while True:
        try:
            async with AsyncSessionLocal() as db:
                # periodically schedule the license sweep
                now = asyncio.get_running_loop().time()
                if now - last_sweep >= settings.LICENSE_SWEEP_SECONDS:
                    last_sweep = now
                    pending_sweep = await db.execute(
                        select(Job).where(
                            Job.type == JobType.LICENSE_SWEEP,
                            Job.status == JobStatus.PENDING,
                        )
                    )
                    if pending_sweep.scalar_one_or_none() is None:
                        await enqueue(db, JobType.LICENSE_SWEEP)
                        await db.commit()
                await run_pending_jobs(db, limit=10)
                await db.commit()
        except Exception:  # noqa: BLE001 — the loop must never die
            logger.exception("worker loop iteration failed")
        await asyncio.sleep(settings.JOB_POLL_SECONDS)


def to_job_out(job: Job) -> dict:
    return {
        "id": str(job.id),
        "type": job.type.value if hasattr(job.type, "value") else str(job.type),
        "status": job.status.value if hasattr(job.status, "value") else str(job.status),
        "payload": json.loads(job.payload or "{}"),
        "attempts": job.attempts,
        "last_error": job.last_error,
        "run_at": job.run_at.isoformat() if job.run_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        "created_at": job.created_at.isoformat() if job.created_at else None,
    }