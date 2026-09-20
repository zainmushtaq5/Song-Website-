import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification, NotificationType
from app.models.user import User


async def create_notification(
    db: AsyncSession,
    user_id: uuid.UUID,
    type_: NotificationType,
    message: str,
    actor_user_id: uuid.UUID | None = None,
    song_id: uuid.UUID | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        type=type_,
        message=message,
        actor_user_id=actor_user_id,
        song_id=song_id,
    )
    db.add(notification)
    await db.flush()
    return notification


async def list_for_user(db: AsyncSession, user: User, limit: int = 50) -> tuple[list[Notification], int]:
    items = (
        await db.execute(
            select(Notification)
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    unread = (
        await db.execute(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user.id, Notification.is_read.is_(False))
        )
    ).scalar_one()
    return list(items), int(unread)


async def mark_all_read(db: AsyncSession, user: User) -> int:
    unread = (
        await db.execute(
            select(Notification).where(
                Notification.user_id == user.id, Notification.is_read.is_(False)
            )
        )
    ).scalars().all()
    for n in unread:
        n.is_read = True
    await db.flush()
    return len(unread)
