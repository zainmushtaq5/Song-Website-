"""Object storage abstraction — zero external dependencies.

Production: Cloudflare R2 (or any S3-compatible store) via raw HTTPS + AWS
Signature V4 implemented with stdlib only (hmac, hashlib, urllib).
Development/tests: local filesystem under LOCAL_STORAGE_DIR.

Replacing boto3/botocore removes ~100 MB from the serverless bundle, bringing
the total well under Vercel's 225 MB limit.
"""

import hashlib
import hmac
import shutil
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import BinaryIO

from app.core.config import settings

# ---------------------------------------------------------------------------
# AWS Signature V4 helpers (stdlib only)
# ---------------------------------------------------------------------------

def _sign(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _signing_key(secret: str, date: str, region: str, service: str) -> bytes:
    k_date    = _sign(("AWS4" + secret).encode("utf-8"), date)
    k_region  = _sign(k_date, region)
    k_service = _sign(k_region, service)
    k_signing = _sign(k_service, "aws4_request")
    return k_signing


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _build_auth_header(
    method: str,
    url: str,
    headers: dict[str, str],
    payload: bytes,
    access_key: str,
    secret_key: str,
    region: str,
    service: str = "s3",
) -> str:
    """Return an Authorization header value for the given request."""
    parsed   = urllib.parse.urlparse(url)
    host     = parsed.netloc
    path     = parsed.path or "/"
    now      = datetime.now(UTC)
    amzdate  = now.strftime("%Y%m%dT%H%M%SZ")
    datestamp = now.strftime("%Y%m%d")

    headers = {**headers, "host": host, "x-amz-date": amzdate}
    payload_hash = _sha256_hex(payload)
    headers["x-amz-content-sha256"] = payload_hash

    signed_headers_list = sorted(headers.keys())
    canonical_headers = "".join(f"{k}:{headers[k]}\n" for k in signed_headers_list)
    signed_headers_str = ";".join(signed_headers_list)

    canonical_request = "\n".join([
        method,
        path,
        "",  # query string
        canonical_headers,
        signed_headers_str,
        payload_hash,
    ])

    credential_scope = f"{datestamp}/{region}/{service}/aws4_request"
    string_to_sign = "\n".join([
        "AWS4-HMAC-SHA256",
        amzdate,
        credential_scope,
        _sha256_hex(canonical_request.encode("utf-8")),
    ])

    signing_key = _signing_key(secret_key, datestamp, region, service)
    signature   = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    auth_header = (
        f"AWS4-HMAC-SHA256 Credential={access_key}/{credential_scope}, "
        f"SignedHeaders={signed_headers_str}, "
        f"Signature={signature}"
    )
    # Return auth header + amzdate so callers can set both
    headers["authorization"] = auth_header
    return headers


def _presign_url(
    method: str,
    endpoint: str,
    bucket: str,
    key: str,
    access_key: str,
    secret_key: str,
    region: str,
    expires: int = 900,
) -> str:
    """Generate an AWS Signature V4 pre-signed URL (no extra deps)."""
    now       = datetime.now(UTC)
    amzdate   = now.strftime("%Y%m%dT%H%M%SZ")
    datestamp = now.strftime("%Y%m%d")

    host         = urllib.parse.urlparse(endpoint).netloc
    encoded_key  = urllib.parse.quote(key, safe="/")
    path         = f"/{bucket}/{encoded_key}"
    service      = "s3"

    credential_scope = f"{datestamp}/{region}/{service}/aws4_request"
    credential       = f"{access_key}/{credential_scope}"

    query_params: dict[str, str] = {
        "X-Amz-Algorithm":     "AWS4-HMAC-SHA256",
        "X-Amz-Credential":    credential,
        "X-Amz-Date":          amzdate,
        "X-Amz-Expires":       str(expires),
        "X-Amz-SignedHeaders": "host",
    }
    query_string = urllib.parse.urlencode(sorted(query_params.items()))

    canonical_request = "\n".join([
        method,
        path,
        query_string,
        f"host:{host}\n",
        "host",
        "UNSIGNED-PAYLOAD",
    ])

    string_to_sign = "\n".join([
        "AWS4-HMAC-SHA256",
        amzdate,
        credential_scope,
        _sha256_hex(canonical_request.encode("utf-8")),
    ])

    signing_key = _signing_key(secret_key, datestamp, region, service)
    signature   = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    final_url = (
        f"{endpoint.rstrip('/')}/{bucket}/{encoded_key}"
        f"?{query_string}&X-Amz-Signature={signature}"
    )
    return final_url


# ---------------------------------------------------------------------------
# StorageService
# ---------------------------------------------------------------------------

class StorageService:
    """Object storage abstraction — no boto3 dependency."""

    def __init__(self) -> None:
        self._driver    = settings.STORAGE_DRIVER
        self._local_dir = Path(settings.LOCAL_STORAGE_DIR)

    # --- internal helpers ---------------------------------------------------

    def _local_path(self, key: str) -> Path:
        safe = Path(key).as_posix().lstrip("/")
        if ".." in safe.split("/"):
            raise ValueError("Invalid storage key")
        return self._local_dir / safe

    def _r2_url(self, key: str) -> str:
        encoded = urllib.parse.quote(key, safe="/")
        return f"{settings.STORAGE_ENDPOINT.rstrip('/')}/{settings.STORAGE_BUCKET}/{encoded}"

    def _r2_request(self, method: str, key: str, data: bytes = b"", content_type: str = "") -> None:
        url = self._r2_url(key)
        extra: dict[str, str] = {}
        if content_type:
            extra["content-type"] = content_type
        signed_headers = _build_auth_header(
            method, url, extra, data,
            settings.STORAGE_ACCESS_KEY,
            settings.STORAGE_SECRET_KEY,
            "auto",
        )
        req = urllib.request.Request(url, data=data or None, method=method)
        for k, v in signed_headers.items():
            if k != "host":  # urllib sets Host automatically
                req.add_header(k.title(), v)
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp.read()

    # --- public API ---------------------------------------------------------

    def upload(self, key: str, fileobj: BinaryIO, content_type: str) -> None:
        if self._driver == "r2":
            fileobj.seek(0)
            data = fileobj.read()
            self._r2_request("PUT", key, data, content_type)
        else:
            path = self._local_path(key)
            path.parent.mkdir(parents=True, exist_ok=True)
            fileobj.seek(0)
            with path.open("wb") as f:
                shutil.copyfileobj(fileobj, f)

    def read_bytes(self, key: str) -> bytes:
        if self._driver == "r2":
            url = self._r2_url(key)
            signed_headers = _build_auth_header(
                "GET", url, {}, b"",
                settings.STORAGE_ACCESS_KEY,
                settings.STORAGE_SECRET_KEY,
                "auto",
            )
            req = urllib.request.Request(url)
            for k, v in signed_headers.items():
                if k != "host":
                    req.add_header(k.title(), v)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read()
        return self._local_path(key).read_bytes()

    def delete(self, key: str) -> None:
        if self._driver == "r2":
            self._r2_request("DELETE", key)
        else:
            path = self._local_path(key)
            if path.exists():
                path.unlink()

    def presigned_get_url(self, key: str, ttl: int | None = None) -> str:
        ttl = ttl or settings.SIGNED_URL_TTL
        if self._driver == "r2":
            return _presign_url(
                "GET",
                settings.STORAGE_ENDPOINT,
                settings.STORAGE_BUCKET,
                key,
                settings.STORAGE_ACCESS_KEY,
                settings.STORAGE_SECRET_KEY,
                "auto",
                expires=ttl,
            )
        # Local dev signed URL
        sig = hmac.new(
            settings.JWT_SECRET.encode(), key.encode(), "sha256"
        ).hexdigest()[:32]
        cdn = settings.CDN_URL or "/media"
        return f"{cdn}/{key}?sig={sig}&ttl={ttl}"

    def presigned_put_url(self, key: str, ttl: int | None = None) -> str:
        ttl = ttl or 900
        if self._driver == "r2":
            return _presign_url(
                "PUT",
                settings.STORAGE_ENDPOINT,
                settings.STORAGE_BUCKET,
                key,
                settings.STORAGE_ACCESS_KEY,
                settings.STORAGE_SECRET_KEY,
                "auto",
                expires=ttl,
            )
        # For local dev, we will just return a fake URL, but the frontend will use standard FastAPI upload instead if it's local, OR we just let the frontend know direct upload isn't supported locally.
        # Actually, let's just construct a dummy URL. 
        return f"http://localhost:3000/api/local-upload-dummy?key={key}"


storage = StorageService()
