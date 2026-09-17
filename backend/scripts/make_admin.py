"""Make a user ADMIN by email (offline DB operation, dev only).

Usage: uv run python scripts/make_admin.py admin@example.com
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select, update

from app.core.database import AsyncSessionLocal, engine
from app.models.user import User, UserRole


async def main() -> None:
    email = sys.argv[1].lower()
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is None:
            print(f"User {email} not found")
            sys.exit(1)
        user.role = UserRole.ADMIN
        await session.commit()
        print(f"Promoted {email} to ADMIN")


if __name__ == "__main__":
    asyncio.run(main())
