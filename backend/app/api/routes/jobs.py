from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.database import get_db
from app.models.job import Job, JobStatus
from app.models.user import User
from app.services import job_service

router = APIRouter(prefix="/admin/jobs", tags=["jobs"])


@router.get("")
async def list_jobs(
    job_status: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[dict]:
    stmt = select(Job).order_by(Job.created_at.desc()).limit(min(limit, 200))
    if job_status:
        try:
            st = JobStatus(job_status)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid status")
        stmt = stmt.where(Job.status == st)
    jobs = (await db.execute(stmt)).scalars().all()
    return [job_service.to_job_out(j) for j in jobs]


@router.post("/sweep")
async def run_jobs_sweep(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict:
    from app.models.job import JobType
    from app.services.job_service import enqueue, run_pending_jobs

    await enqueue(db, JobType.LICENSE_SWEEP)
    ran = await run_pending_jobs(db, limit=limit)
    await db.commit()
    return {"status": "ok", "jobs_processed": ran}