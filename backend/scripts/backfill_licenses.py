"""Backfill: create a License row for every song that lacks one.

Existing songs: APPROVED if they already declared a license_type at upload
(they were validated then), else PENDING. Run once:
  uv run python scripts/backfill_licenses.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.license import License, LicenseStatus  # noqa: E402
from app.models.song import Song  # noqa: E402


async def main() -> None:
    async with AsyncSessionLocal() as db:
        songs = (await db.execute(select(Song))).scalars().all()
        created = 0
        for song in songs:
            existing = (
                await db.execute(select(License).where(License.song_id == song.id))
            ).scalar_one_or_none()
            if existing is not None:
                continue
            lic = License(
                song_id=song.id,
                status=LicenseStatus.APPROVED if song.license_type else LicenseStatus.PENDING,
                license_type=song.license_type.value if song.license_type else None,
                rights_holder=song.artist.name if song.artist else None,
                effective_from=song.created_at,
            )
            db.add(lic)
            created += 1
        await db.commit()
        print(f"backfill complete: {created} licenses created")


if __name__ == "__main__":
    asyncio.run(main())