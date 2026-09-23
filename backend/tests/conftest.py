import asyncio
import os
import tempfile
from pathlib import Path

# Test environment must be configured before app imports read Settings.
_TMP = tempfile.mkdtemp(prefix="songs-test-storage-")
os.environ.setdefault("STORAGE_DRIVER", "local")
os.environ.setdefault("LOCAL_STORAGE_DIR", _TMP)
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("REDIS_URL", "")  # in-process limiter for tests

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core.database import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402

TEST_DB_URL = f"sqlite+aiosqlite:///{Path(_TMP) / 'test.db'}"

_engine = create_async_engine(TEST_DB_URL, poolclass=StaticPool, connect_args={"check_same_thread": False})
_TestSession = async_sessionmaker(_engine, expire_on_commit=False)


async def _override_get_db():
    async with _TestSession() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


@pytest.fixture(autouse=True)
async def _setup_database():
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    from app.core import rate_limit

    rate_limit._windows.clear()
    yield
    rate_limit._windows.clear()


@pytest.fixture
def client() -> TestClient:
    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)


# --- shared test data ---
MP3_BYTES = b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\x00" * 2048
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 512


@pytest.fixture
def auth_headers(client: TestClient) -> dict:
    r = client.post(
        "/api/auth/register",
        json={"email": "artist@test.dev", "username": "artist_one", "password": "password123", "is_artist": True},
    )
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def user_headers(client: TestClient) -> dict:
    r = client.post(
        "/api/auth/register",
        json={"email": "listener@test.dev", "username": "listener_one", "password": "password123"},
    )
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def admin_headers(client: TestClient) -> dict:
    r = client.post(
        "/api/auth/register",
        json={"email": "admin@test.dev", "username": "admin_user", "password": "password123"},
    )
    assert r.status_code == 201, r.text

    async def _promote() -> None:
        async with _TestSession() as session:
            result = await session.execute(select(User).where(User.email == "admin@test.dev"))
            u = result.scalar_one()
            u.role = UserRole.ADMIN
            await session.commit()

    asyncio.run(_promote())
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def approved_song(client: TestClient, auth_headers: dict, admin_headers: dict) -> dict:
    files = {
        "audio": ("track.mp3", MP3_BYTES, "audio/mpeg"),
        "cover": ("cover.png", PNG_BYTES, "image/png"),
    }
    data = {
        "title": "Test Song",
        "description": "A song for testing",
        "genre": "Hip-Hop",
        "download_allowed": "true",
        "license_type": "artist_owned",
        "rights_note": "I own this recording",
    }
    r = client.post("/api/songs", data=data, files=files, headers=auth_headers)
    assert r.status_code == 201, r.text
    song_id = r.json()["id"]
    r = client.post(f"/api/admin/songs/{song_id}/approve", headers=admin_headers)
    assert r.status_code == 200, r.text
    _approve_license(client, admin_headers, song_id)
    r = client.get(f"/api/songs/{song_id}")
    assert r.status_code == 200, r.text
    return r.json()


def _approve_license(client: TestClient, admin_headers: dict, song_id: str) -> None:
    """Approve the song's PENDING license (Phase 3: downloads need an approved license)."""
    lics = client.get("/api/admin/licenses", headers=admin_headers).json()
    lic = next((l for l in lics if l["song_id"] == song_id), None)
    assert lic is not None, f"no license for song {song_id}"
    r = client.post(f"/api/admin/licenses/{lic['id']}/approve", headers=admin_headers, json={})
    assert r.status_code == 200, r.text
