from pydantic import BaseModel, Field


class ArtistPublic(BaseModel):
    id: str
    name: str
    slug: str
    bio: str | None
    avatar_url: str | None


class SongSummary(BaseModel):
    id: str
    title: str
    slug: str
    cover_url: str | None
    duration_sec: int
    play_count: int
    like_count: int
    download_allowed: bool
    artist_name: str
    artist_slug: str


class SearchResults(BaseModel):
    query: str
    songs: list[SongSummary]
    artists: list[ArtistPublic]


class ProfileUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_]+$")


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)
