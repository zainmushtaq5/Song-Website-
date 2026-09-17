import hmac
import mimetypes

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.config import settings
from app.services.storage_service import storage

router = APIRouter(prefix="/media", tags=["media"])


def _verify_signature(key: str, sig: str) -> None:
    expected = hmac.new(settings.JWT_SECRET.encode(), key.encode(), "sha256").hexdigest()[:32]
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(status_code=403, detail="Invalid media signature")


@router.get("/{key:path}")
async def get_media(key: str, sig: str, ttl: int = 900) -> FileResponse:
    """Local-dev media endpoint (storage driver=local only). Validates the HMAC signature."""
    if settings.STORAGE_DRIVER == "r2":
        raise HTTPException(status_code=404, detail="Not served here")
    _verify_signature(key, sig)
    if not key.startswith("audio/") and not key.startswith("covers/"):
        raise HTTPException(status_code=404, detail="Not found")
    path = storage._local_path(key)  # noqa: SLF001 - same package, deliberate
    if not path.exists():
        raise HTTPException(status_code=404, detail="Not found")
    guessed = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    return FileResponse(path, media_type=guessed)
