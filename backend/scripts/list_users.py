import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.user import User


async def main() -> None:
    async with AsyncSessionLocal() as s:
        rows = (await s.execute(select(User.email, User.username, User.role))).all()
        print(f"{len(rows)} users in DB:")
        for email, username, role in rows:
            print(f"  {email} | {username} | {role}")


asyncio.run(main())
