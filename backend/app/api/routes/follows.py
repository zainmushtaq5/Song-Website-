from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.services import follow_service

router = APIRouter(prefix="/artists", tags=["follows"])


@router.post("/{slug}/follow")
async def follow_artist(
    slug: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    following, _artist = await follow_service.toggle_follow(db, request, slug, user)
    return {"following": following}
