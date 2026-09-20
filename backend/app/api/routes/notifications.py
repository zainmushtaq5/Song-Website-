from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    items, unread_count = await notification_service.list_for_user(db, user)
    return {
        "unread_count": unread_count,
        "notifications": [
            {
                "id": str(n.id),
                "type": n.type,
                "message": n.message,
                "is_read": n.is_read,
                "created_at": n.created_at,
            }
            for n in items
        ],
    }


@router.post("/read-all")
async def read_all(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    marked = await notification_service.mark_all_read(db, user)
    return {"marked": marked}
