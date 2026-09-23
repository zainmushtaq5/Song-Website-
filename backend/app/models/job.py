import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class JobType(str, enum.Enum):
    PROBE_UPLOAD = "probe_upload"
    LICENSE_SWEEP = "license_sweep"


class JobStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    DONE = "DONE"
    FAILED = "FAILED"


class Job(Base, UUIDMixin, TimestampMixin):
    """Durable background job row. The in-process worker polls this table.

    payload is a JSON string (Text keeps SQLite/Postgres portable).
    """

    __tablename__ = "jobs"

    type: Mapped[JobType] = mapped_column(
        Enum(JobType, name="job_type", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus, name="job_status", values_callable=lambda e: [m.value for m in e]),
        default=JobStatus.PENDING,
        nullable=False,
        index=True,
    )
    payload: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)