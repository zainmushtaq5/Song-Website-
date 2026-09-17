from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.rate_limit import enforce_rate_limit
from app.schemas.auth import (
    AccessOnly,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
    UserOut,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)) -> TokenPair:
    await enforce_rate_limit(request, "register")
    user, tokens = await auth_service.register(db, data)
    return tokens


@router.post("/login", response_model=TokenPair)
async def login(data: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)) -> TokenPair:
    await enforce_rate_limit(request, "login")
    return await auth_service.login(db, data.email, data.password)


@router.post("/refresh", response_model=AccessOnly)
async def refresh(data: RefreshRequest, request: Request, db: AsyncSession = Depends(get_db)) -> AccessOnly:
    return AccessOnly(access_token=await auth_service.refresh(db, data.refresh_token))


@router.get("/me", response_model=UserOut)
async def me(user=Depends(get_current_user)) -> UserOut:
    return auth_service.to_user_out(user)
