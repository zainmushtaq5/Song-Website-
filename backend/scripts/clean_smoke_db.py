"""Remove synthetic e2e uploads from the smoke DB (dev only).

The e2e suites upload throwaway songs with fake covers (a PNG signature plus
zero bytes) and stub audio. Those rows then sit at the top of the feed and make
data-driven checks meaningless — e2e/media-test.mjs asserts the first song's
cover actually decodes (`naturalWidth > 0`), which no fake cover can satisfy.

    uv run python scripts/clean_smoke_db.py --list      # show what would go
    uv run python scripts/clean_smoke_db.py --apply     # delete songs + accounts
    uv run python scripts/seed_demo.py                  # re-seed clean demo data

Songs are matched by title pattern (the titles the e2e scripts upload); accounts
are matched by email domain, keeping the seeded demo users and the smoke admin.
Storage objects for deleted songs are removed too.
"""

from __future__ import annotations

import asyncio
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, select, text

from app.core.database import AsyncSessionLocal
from app.models import Base  # noqa: F401 - ensures every mapper is configured
from app.models.song import Song
from app.models.user import User
from app.services.storage_service import storage

#: Titles uploaded by the e2e suites. Keep this list next to e2e/*.mjs.
SONG_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"^Viz Tone [AB] \d+$",  # visualizer-screens.mjs
        r"^Rec ",  # recommendations / license suites
        r"Screenshot Song$",  # screenshot / analytics / jobs suites
        r"^Jobs Screenshot Song$",
        r"^Analytics Screenshot Song$",
        r"^Badge Test Song$",
        r"^Rights Workflow Song$",
        r"^Follow UI Song$",
        r"^Smoke Test",
        r"Test Song$",
    )
]

#: Seeded demo accounts (seed_demo.py) and the promoted smoke admin survive.
KEEP_EMAIL = re.compile(r"^(admin-smoke@|(nova|ripple|atlas)-|listener-)", re.IGNORECASE)
#: Throwaway accounts created by e2e runs.
DROP_EMAIL = re.compile(r"@smoketest\.example\.com$", re.IGNORECASE)


def matches(title: str) -> bool:
    return any(pattern.search(title) for pattern in SONG_PATTERNS)


async def main() -> None:
    apply = "--apply" in sys.argv
    # SQLite needs this per connection for the ON DELETE CASCADE rules to fire.
    async with AsyncSessionLocal() as session:
        await session.execute(text("PRAGMA foreign_keys=ON"))

        songs = (await session.execute(select(Song).order_by(Song.created_at))).scalars().all()
        doomed = [song for song in songs if matches(song.title)]
        users = (await session.execute(select(User))).scalars().all()
        doomed_users = [
            user
            for user in users
            if DROP_EMAIL.search(user.email) and not KEEP_EMAIL.search(user.email)
        ]

        print(f"songs: {len(songs)} total, {len(doomed)} synthetic")
        for song in doomed:
            print(f"  - {song.title!r} [{song.status}] audio={song.audio_key}")
        print(f"accounts: {len(users)} total, {len(doomed_users)} synthetic")
        for user in doomed_users:
            print(f"  - {user.email} ({user.role})")

        if not apply:
            print("\nDry run. Re-run with --apply to delete the rows above.")
            return

        keys = [(song.audio_key, song.cover_key) for song in doomed]
        # Core deletes, not ORM session.delete: the ORM nulls non-cascading
        # foreign keys (plays.user_id is NOT NULL) instead of letting the
        # database apply its ON DELETE CASCADE rules.
        if doomed:
            await session.execute(delete(Song).where(Song.id.in_([song.id for song in doomed])))
        if doomed_users:
            await session.execute(delete(User).where(User.id.in_([user.id for user in doomed_users])))
        await session.commit()

        removed = 0
        for audio_key, cover_key in keys:
            for key in (audio_key, cover_key):
                try:
                    storage.delete(key)
                    removed += 1
                except Exception as error:  # noqa: BLE001 - best effort cleanup
                    print(f"  ! could not delete {key}: {error}")
        print(f"\ndeleted {len(doomed)} songs, {len(doomed_users)} accounts, {removed} storage objects")
        print("re-seed with: uv run python scripts/seed_demo.py")


if __name__ == "__main__":
    asyncio.run(main())
