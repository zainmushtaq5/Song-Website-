from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    APP_NAME: str = "Songs Website API"
    ENVIRONMENT: str = "development"  # development | production
    DEBUG: bool = True
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:3001", "http://localhost:3100"]

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://songs:songs@localhost:5432/songs"
    AUTO_CREATE_TABLES: bool = False  # dev convenience; production uses Alembic

    # JWT
    JWT_SECRET: str = "dev-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Object storage (R2 via S3 API). In dev, STORAGE_DRIVER=local writes to .storage/
    STORAGE_DRIVER: str = "local"  # local | r2
    STORAGE_ENDPOINT: str = ""
    STORAGE_ACCESS_KEY: str = ""
    STORAGE_SECRET_KEY: str = ""
    STORAGE_BUCKET: str = "songs-media"
    CDN_URL: str = ""
    LOCAL_STORAGE_DIR: str = ".storage"

    # Signed URL TTL (seconds)
    SIGNED_URL_TTL: int = 900

    # Redis (rate limiting). Empty = in-process limiter fallback (dev/test).
    REDIS_URL: str = ""

    # Upload limits
    MAX_AUDIO_BYTES: int = 50 * 1024 * 1024  # 50 MB
    MAX_COVER_BYTES: int = 5 * 1024 * 1024  # 5 MB


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
