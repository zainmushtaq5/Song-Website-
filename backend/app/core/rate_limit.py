"""Rate limiting via Upstash Redis when configured; in-process sliding window fallback."""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.core.config import settings

_redis = None
if settings.REDIS_URL:
    import redis.asyncio as aioredis

    _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

# Fallback: per-process windows (fine for dev/test with a single worker)
_windows: dict[str, deque[float]] = defaultdict(deque)

# key name -> (limit, window_seconds)
# Per-IP (or per-user where identified). Chosen to be dev-friendly while still
# meaningfully limiting abuse in production.
LIMITS: dict[str, tuple[int, int]] = {
    "login": (30, 60),
    "register": (30, 3600),
    "upload": (30, 3600),
    "download": (60, 3600),
    "search": (120, 60),
    "play": (240, 60),
    "like": (120, 60),
}


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def enforce_rate_limit(request: Request, bucket: str, identifier: str | None = None) -> None:
    limit, window = LIMITS[bucket]
    ident = identifier or _client_ip(request)
    key = f"rl:{bucket}:{ident}"

    if _redis is not None:
        # Simple fixed window using INCR + EXPIRE
        count = await _redis.incr(key)
        if count == 1:
            await _redis.expire(key, window)
        if count > limit:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded")
        return

    now = time.monotonic()
    q = _windows[key]
    while q and q[0] <= now - window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded")
    q.append(now)
