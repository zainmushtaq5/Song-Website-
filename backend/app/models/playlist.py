import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Playlist(Base, UUIDMixin, TimestampMixin):
    """A user-created, ordered collection of songs."""

    __tablename__ = "playlists"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    songs: Mapped[list["PlaylistSong"]] = relationship(back_populates="playlist", lazy="selectin")


class PlaylistSong(Base, UUIDMixin):
    __tablename__ = "playlist_songs"
    __table_args__ = (UniqueConstraint("playlist_id", "song_id", name="uq_playlist_songs"),)

    playlist_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("playlists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    song_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("songs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    playlist: Mapped[Playlist] = relationship(back_populates="songs")
