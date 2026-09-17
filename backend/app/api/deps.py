from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import ACCESS_TOKEN_TYPE, decode_token
from app.models.user import User, UserRole

bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if creds is None:
        raise unauthorized
    payload = decode_token(creds.credentials, ACCESS_TOKEN_TYPE)
    if payload is None:
        raise unauthorized
    user_id = payload.get("sub")
    if not user_id:
        raise unauthorized
    user = await db.get(User, UUID(user_id))
    if user is None or not user.is_active or user.deleted_at is not None:
        raise unauthorized
    return user


async def get_optional_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer), db: AsyncSession = Depends(get_db)) -> User | None:
    if creds is None:
        return None
    payload = decode_token(creds.credentials, ACCESS_TOKEN_TYPE)
    if payload is None or not payload.get("sub"):
        return None
    user = await db.get(User, UUID(payload["sub"]))
    if user is None or not user.is_active or user.deleted_at is not None:
        return None
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
