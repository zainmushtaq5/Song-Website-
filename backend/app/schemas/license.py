from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.license import LicenseStatus


class LicenseUpdate(BaseModel):
    """Artist submits/updates rights info; any edit resets review to PENDING."""

    license_type: str = Field(min_length=1, max_length=30)
    rights_holder: str = Field(min_length=1, max_length=200)
    proof_reference: str | None = Field(default=None, max_length=512)
    effective_from: str | None = Field(default=None, max_length=40)
    effective_until: str | None = Field(default=None, max_length=40)


class LicenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    song_id: UUID
    song_title: str | None = None
    artist_name: str | None = None
    status: LicenseStatus
    license_type: str | None = None
    rights_holder: str | None = None
    proof_reference: str | None = None
    effective_from: datetime | None = None
    effective_until: datetime | None = None
    reviewed_at: datetime | None = None
    review_note: str | None = None
    action_reason: str | None = None
    created_at: datetime


class LicenseStatusOut(BaseModel):
    id: UUID
    song_id: UUID
    status: LicenseStatus
    action_reason: str | None = None