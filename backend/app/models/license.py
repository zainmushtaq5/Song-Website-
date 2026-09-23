import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class LicenseStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"
    SUSPENDED = "SUSPENDED"
    REMOVED = "REMOVED"


class License(Base, UUIDMixin, TimestampMixin):
    """Rights record for one song (one current license per song; history in admin_actions).

    An APPROVED license that has passed effective_until is treated as EXPIRED
    (swept lazily at read/download time and by the worker in Phase 3.4).
    """

    __tablename__ = "licenses"

    song_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("songs.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    status: Mapped[LicenseStatus] = mapped_column(
        Enum(LicenseStatus, name="license_status", values_callable=lambda e: [m.value for m in e]),
        default=LicenseStatus.PENDING,
        nullable=False,
    )
    license_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    rights_holder: Mapped[str | None] = mapped_column(String(200), nullable=True)
    proof_reference: Mapped[str | None] = mapped_column(String(512), nullable=True)
    effective_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    action_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    def is_expired(self, now: datetime) -> bool:
        return self.effective_until is not None and self.effective_until <= now

