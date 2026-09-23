import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin
from app.models.license import License, LicenseStatus
from app.models.user import Artist


class SongStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class LicenseType(str, enum.Enum):
    ROYALTY_FREE = "royalty_free"
    ARTIST_OWNED = "artist_owned"
    CC_BY = "cc_by"
    OTHER = "other"


class Genre(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "genres"

    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)


class Song(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "songs"
    __table_args__ = (
        Index("ix_songs_status_created", "status", "created_at"),
        Index("ix_songs_plays", "play_count"),
    )

    artist_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("artists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    genre_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("genres.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(240), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    audio_key: Mapped[str] = mapped_column(String(512), nullable=False)
    cover_key: Mapped[str] = mapped_column(String(512), nullable=False)
    duration_sec: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bitrate_kbps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sample_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    play_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    download_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    like_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    download_allowed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    license_type: Mapped[LicenseType | None] = mapped_column(
        Enum(LicenseType, name="license_type", values_callable=lambda e: [m.value for m in e]),
        nullable=True,
    )
    rights_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[SongStatus] = mapped_column(
        Enum(SongStatus, name="song_status", values_callable=lambda e: [m.value for m in e]),
        default=SongStatus.PENDING,
        nullable=False,
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    artist: Mapped[Artist] = relationship(lazy="joined")
    genre: Mapped[Genre | None] = relationship(lazy="joined")
    license: Mapped[License | None] = relationship(
        lazy="joined", uselist=False, foreign_keys=[License.song_id]
    )

    def is_downloadable(self) -> bool:
        return self.status == SongStatus.APPROVED and self.download_allowed

    def license_effective(self, now: datetime) -> bool:
        """License gate: APPROVED and not past its expiry date."""
        lic = self.license
        if lic is None:
            return False
        status = lic.status
        if status == LicenseStatus.APPROVED and lic.is_expired(now):
            status = LicenseStatus.EXPIRED
        return status == LicenseStatus.APPROVED


class AdminAction(Base, UUIDMixin):
    """Minimal audit log for Phase 1 (approve/reject)."""

    __tablename__ = "admin_actions"

    admin_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
