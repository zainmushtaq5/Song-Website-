import uuid

from pydantic import BaseModel, Field


class PlaylistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    is_public: bool = True


class PlaylistUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    is_public: bool | None = None


class PlaylistSongAdd(BaseModel):
    song_id: uuid.UUID
