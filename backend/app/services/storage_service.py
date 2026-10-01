import shutil
from pathlib import Path
from typing import BinaryIO

import boto3
from botocore.client import Config as BotoConfig

from app.core.config import settings


class StorageService:
    """Object storage abstraction.

    production: Cloudflare R2 via the S3 API (STORAGE_DRIVER=r2).
    development/tests: local filesystem under LOCAL_STORAGE_DIR (STORAGE_DRIVER=local).
    """

    def __init__(self) -> None:
        self._driver = settings.STORAGE_DRIVER
        self._local_dir = Path(settings.LOCAL_STORAGE_DIR)
        self._s3 = None  # Lazy-initialized on first use to avoid import-time crashes

    def _get_s3(self):
        """Return the boto3 S3 client, creating it lazily on first call."""
        if self._s3 is None:
            if self._driver != "r2":
                raise RuntimeError("S3 client requested but STORAGE_DRIVER is not 'r2'")
            self._s3 = boto3.client(
                "s3",
                endpoint_url=settings.STORAGE_ENDPOINT,
                aws_access_key_id=settings.STORAGE_ACCESS_KEY,
                aws_secret_access_key=settings.STORAGE_SECRET_KEY,
                config=BotoConfig(signature_version="s3v4"),
                region_name="auto",
            )
        return self._s3

    def _local_path(self, key: str) -> Path:
        # Defense in depth: never allow path traversal from a storage key.
        safe = Path(key).as_posix().lstrip("/")
        if ".." in safe.split("/"):
            raise ValueError("Invalid storage key")
        return self._local_dir / safe

    def upload(self, key: str, fileobj: BinaryIO, content_type: str) -> None:
        if self._driver == "r2":
            self._get_s3().upload_fileobj(fileobj, settings.STORAGE_BUCKET, key, ExtraArgs={"ContentType": content_type})
        else:
            path = self._local_path(key)
            path.parent.mkdir(parents=True, exist_ok=True)
            fileobj.seek(0)
            with path.open("wb") as f:
                shutil.copyfileobj(fileobj, f)

    def read_bytes(self, key: str) -> bytes:
        if self._driver == "r2":
            obj = self._get_s3().get_object(Bucket=settings.STORAGE_BUCKET, Key=key)
            return obj["Body"].read()
        return self._local_path(key).read_bytes()

    def delete(self, key: str) -> None:
        if self._driver == "r2":
            self._get_s3().delete_object(Bucket=settings.STORAGE_BUCKET, Key=key)
        else:
            path = self._local_path(key)
            if path.exists():
                path.unlink()

    def presigned_get_url(self, key: str, ttl: int | None = None) -> str:
        ttl = ttl or settings.SIGNED_URL_TTL
        if self._driver == "r2":
            return self._get_s3().generate_presigned_url(
                "get_object",
                Params={"Bucket": settings.STORAGE_BUCKET, "Key": key},
                ExpiresIn=ttl,
            )
        # Local dev: "signed" path-only URL relative to the app; the media route
        # validates the signature in storage_routes.
        import hmac

        from app.core.config import settings as s

        sig = hmac.new(s.JWT_SECRET.encode(), key.encode(), "sha256").hexdigest()[:32]
        return f"{s.CDN_URL or '/media'}/{key}?sig={sig}&ttl={ttl}"


storage = StorageService()
