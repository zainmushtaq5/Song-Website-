import uuid

from fastapi import HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import enforce_rate_limit
from app.models.engagement import Follow
from app.models.notification import NotificationType
from app.models.user import Artist, User
from app.services import notification_service


async def get_artist_by_slug(db: AsyncSession, slug: str) -> Artist | None:
    result = await db.execute(
        select(Artist).where(Artist.slug == slug, Artist.deleted_at.is_(None))
    )
    return result.scalar_one_or_none()


async def follower_count(db: AsyncSession, artist_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count()).select_from(Follow).where(Follow.artist_id == artist_id)
    )
    return int(result.scalar_one())


async def is_following(db: AsyncSession, user: User | None, artist_id: uuid.UUID) -> bool:
    if user is None:
        return False
    existing = (
        await db.execute(
            select(Follow).where(Follow.follower_id == user.id, Follow.artist_id == artist_id)
        )
    ).scalar_one_or_none()
    return existing is not None


async def toggle_follow(
    db: AsyncSession, request: Request, slug: str, user: User
) -> tuple[bool, Artist]:
    """Follow/unfollow an artist by slug. Returns (following, artist)."""
    await enforce_rate_limit(request, "like", str(user.id))  # same bucket as likes
    artist = await get_artist_by_slug(db, slug)
    if artist is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    if artist.user_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="You cannot follow yourself"
        )

    existing = (
        await db.execute(
            select(Follow).where(Follow.follower_id == user.id, Follow.artist_id == artist.id)
        )
    ).scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.flush()
        return False, artist

    db.add(Follow(follower_id=user.id, artist_id=artist.id))
    await db.flush()
    # Notify the artist's user account about the new follower
    await notification_service.create_notification(
        db,
        user_id=artist.user_id,
        type_=NotificationType.NEW_FOLLOWER,
        message=f"{user.username} started following you",
        actor_user_id=user.id,
    )
    return True, artist


async def user_following_artists(db: AsyncSession, user: User) -> list[Artist]:
    """Artists the user follows, newest follow first."""
    result = await db.execute(
        select(Artist)
        .join(Follow, Follow.artist_id == Artist.id)
        .where(Follow.follower_id == user.id, Artist.deleted_at.is_(None))
        .order_by(Follow.created_at.desc())
    )
    return list(result.scalars().all())
