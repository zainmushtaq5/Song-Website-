import asyncio
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import admin, artists, auth, follows, search, songs, storage_routes, users
from app.core.config import settings


def _use_selector_event_loop_on_windows() -> None:
    """Kill-switch for a Windows-specific uvicorn bug: a client abruptly
    disconnecting raises ConnectionResetError inside the Proactor loop's
    _call_connection_lost, which terminates the whole server. The selector
    loop doesn't have this issue. Must run before the event loop is created
    (module import time is early enough for `uvicorn app.main:app`).
    """
    if sys.platform == "win32":
        from asyncio import WindowsProactorEventLoopPolicy, WindowsSelectorEventLoopPolicy

        if type(asyncio.get_event_loop_policy()) is WindowsProactorEventLoopPolicy:
            asyncio.set_event_loop_policy(WindowsSelectorEventLoopPolicy())


_use_selector_event_loop_on_windows()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.AUTO_CREATE_TABLES:
        from app.core.database import engine
        from app.models import Base

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(songs.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(artists.router, prefix="/api")
app.include_router(follows.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
if settings.STORAGE_DRIVER == "local":
    app.include_router(storage_routes.router)  # local dev media serving


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
