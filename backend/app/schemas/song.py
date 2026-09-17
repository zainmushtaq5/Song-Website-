from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.song import LicenseType, SongStatus


class SongCreateMeta(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    genre: str | None = Field(default=None, max_length=80)
    download_allowed: bool = False
    license_type: LicenseType | None = None
    rights_note: str | None = Field(default=None, max_length=2000)


class SongOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    slug: str
    description: str | None = None
    duration_sec: int
    play_count: int
    download_count: int
    like_count: int
    download_allowed: bool
    license_type: LicenseType | None = None
    rights_note: str | None = None
    status: SongStatus
    cover_url: str | None = None
    audio_url: str | None = None
    artist_id: UUID
    genre: str | None = None
    artist_name: str | None = None
    artist_slug: str | None = None
    created_at: datetime
    rejection_reason: str | None = None


class SongRejected(BaseModel):
    rejection_reason: str = Field(min_length=3, max_length=2000)


class SongStatusOut(BaseModel):
    id: UUID
    status: SongStatus
    rejection_reason: str | None = None
