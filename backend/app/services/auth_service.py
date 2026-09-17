import re
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    ACCESS_TOKEN_TYPE,
    REFRESH_TOKEN_TYPE,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import Artist, User, UserRole
from app.schemas.auth import RegisterRequest, TokenPair, UserOut
from app.utils.slug import unique_slug

RESERVED_USERNAMES = {"admin", "root", "api", "me", "support", "songs", "null", "undefined"}


def validate_username(username: str) -> None:
    if username.lower() in RESERVED_USERNAMES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Username not allowed")
    if not re.fullmatch(r"[a-zA-Z0-9_]{3,50}", username):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid username")


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(func.lower(User.email) == email.lower()))
    return result.scalar_one_or_none()


async def get_by_username(db: AsyncSession, username: str) -> User | None:
    result = await db.execute(select(User).where(func.lower(User.username) == username.lower()))
    return result.scalar_one_or_none()


async def register(db: AsyncSession, data: RegisterRequest) -> tuple[User, TokenPair]:
    validate_username(data.username)
    if await get_by_email(db, data.email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    if await get_by_username(db, data.username):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    role = UserRole.ARTIST if data.is_artist else UserRole.USER
    user = User(
        email=data.email.lower(),
        username=data.username,
        password_hash=hash_password(data.password),
        role=role,
    )
    db.add(user)
    await db.flush()
    if role == UserRole.ARTIST:
        db.add(Artist(user_id=user.id, name=data.username, slug=unique_slug(data.username, 120)))
        await db.flush()

    return user, issue_tokens(user)


def issue_tokens(user: User) -> TokenPair:
    return TokenPair(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id),
    )


async def login(db: AsyncSession, email: str, password: str) -> TokenPair:
    user = await get_by_email(db, email)
    if user is None or user.deleted_at is not None or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    return issue_tokens(user)


async def refresh(db: AsyncSession, refresh_token: str) -> str:
    payload = decode_token(refresh_token, REFRESH_TOKEN_TYPE)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    user = await db.get(User, UUID(payload["sub"]))
    if user is None or not user.is_active or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    return create_access_token(user.id, user.role.value)


def to_user_out(user: User) -> UserOut:
    return UserOut.model_validate(user)
