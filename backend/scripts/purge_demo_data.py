"""Purge ALL demo/seed content from a local dev database.

`clean_smoke_db.py` removes only the throwaway rows individual e2e suites upload,
which is what you want between test runs. This script is the heavier hammer: it
answers "I want my database to contain no sample content at all", so it removes
every seeded demo song and every seeded demo artist/listener account, the storage
objects behind them, and the audit/job rows that only exist because of them.

    uv run python scripts/purge_demo_data.py --list     # show what would go
    uv run python scripts/purge_demo_data.py --apply    # delete it

Account selection: anything on the demo domains the seed/e2e scripts register
(@smoketest.example.com, @rec.example.com, @test.dev). Admin accounts are kept by
default — an admin is not an "artist account", and the admin panel is unusable
without one — unless you pass --include-admins.

Songs: every song whose artist belongs to a purged account, plus the e2e fixture
titles from clean_smoke_db (in case someone uploaded one with an account that is
kept). Deleting is hard, not soft: the goal is a database with nothing stale left.
"""

from __future__ import annotations

import asyncio
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlalchemy import delete, or_, select, text  # noqa: E402

from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models import Base  # noqa: F401 - ensures every mapper is configured  # noqa: E402
from app.models.job import Job, JobStatus  # noqa: E402
from app.models.license import License  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.song import AdminAction, Genre, Song  # noqa: E402
from app.models.user import Artist, User, UserRole  # noqa: E402
from app.services.storage_service import storage  # noqa: E402
from clean_smoke_db import matches as matches_fixture_title  # noqa: E402

#: Domains the seed + e2e scripts register accounts on.
DEMO_EMAIL = re.compile(r"@(smoketest\.example\.com|rec\.example\.com|test\.dev)$", re.IGNORECASE)

#: Tables counted in the before/after report, in report order.
COUNT_TABLES = (
    "songs",
    "artists",
    "users",
    "genres",
    "licenses",
    "playlists",
    "playlist_songs",
    "plays",
    "likes",
    "downloads",
    "follows",
    "notifications",
    "admin_actions",
    "jobs",
)


async def counts(session) -> dict[str, int]:
    out: dict[str, int] = {}
    for table in COUNT_TABLES:
        out[table] = (
            await session.execute(text(f"SELECT COUNT(*) FROM {table}"))  # noqa: S608 - fixed names
        ).scalar_one()
    return out


def report(label: str, stats: dict[str, int]) -> None:
    print(f"{label}: " + "  ".join(f"{name}={value}" for name, value in stats.items()))


async def main() -> None:
    apply = "--apply" in sys.argv
    include_admins = "--include-admins" in sys.argv

    async with AsyncSessionLocal() as session:
        # SQLite needs this per connection for ON DELETE CASCADE to fire.
        await session.execute(text("PRAGMA foreign_keys=ON"))

        before = await counts(session)

        users = (await session.execute(select(User))).scalars().all()
        doomed_users = [
            user
            for user in users
            if DEMO_EMAIL.search(user.email) and (include_admins or user.role != UserRole.ADMIN)
        ]
        kept_users = [user for user in users if user not in doomed_users]
        doomed_user_ids = {user.id for user in doomed_users}

        artists = (await session.execute(select(Artist))).scalars().all()
        doomed_artist_ids = {artist.id for artist in artists if artist.user_id in doomed_user_ids}

        songs = (await session.execute(select(Song))).scalars().all()
        doomed_songs = [
            song for song in songs if song.artist_id in doomed_artist_ids or matches_fixture_title(song.title)
        ]

        print("Demo/seed purge — accounts matched on:", DEMO_EMAIL.pattern)
        print(f"  accounts to delete: {len(doomed_users)}")
        for user in doomed_users:
            print(f"    - {user.role:<7} {user.email}")
        print(f"  songs to delete: {len(doomed_songs)}")
        for song in doomed_songs:
            print(f"    - {song.title!r} [{song.status}] audio={song.audio_key}")
        print(f"  accounts kept: {len(kept_users)}")
        for user in kept_users:
            print(f"    = {user.role:<7} {user.email}")

        if not apply:
            report("Before", before)
            print("\nDry run. Re-run with --apply to delete the rows above.")
            return

        doomed_song_ids = {song.id for song in doomed_songs}
        storage_keys = [(song.audio_key, song.cover_key) for song in doomed_songs]

        # Core deletes, not ORM session.delete: the ORM nulls non-cascading foreign
        # keys (plays.user_id is NOT NULL) instead of letting the database cascade.
        if doomed_song_ids:
            await session.execute(delete(Song).where(Song.id.in_(doomed_song_ids)))
        if doomed_artist_ids:
            await session.execute(delete(Artist).where(Artist.id.in_(doomed_artist_ids)))
        if doomed_user_ids:
            await session.execute(delete(User).where(User.id.in_(doomed_user_ids)))

        # Rows that referenced the purged rows but are not cascaded by foreign key.
        if doomed_song_ids:
            payload_matches = [Job.payload.contains(str(song_id)) for song_id in doomed_song_ids]
            await session.execute(delete(Job).where(or_(*payload_matches)))
        # Finished queue history from demo/e2e runs: DONE rows are pure history (sweeps
        # carry no payload, probe jobs are only meaningful while their song exists).
        # PENDING/FAILED rows stay, because those are live queue state.
        await session.execute(delete(Job).where(Job.status == JobStatus.DONE))
        if doomed_user_ids:
            await session.execute(delete(Notification).where(Notification.actor_user_id.in_(doomed_user_ids)))
        # Audit rows whose target no longer exists: the actions they record were taken
        # on demo content (song actions and the license reviews behind them).
        for target_type, model in (("song", Song), ("license", License)):
            await session.execute(
                delete(AdminAction).where(
                    AdminAction.target_type == target_type,
                    ~select(model.id).where(model.id == AdminAction.target_id).exists(),
                )
            )
        # Notifications about songs that no longer exist (song_id was SET NULL).
        await session.execute(
            delete(Notification).where(
                Notification.song_id.is_(None),
                Notification.type.in_(("song_approved", "song_rejected")),
            )
        )

        # Genres only exist because a demo upload created them.
        orphan_genres = (
            await session.execute(
                select(Genre).where(~select(Song.id).where(Song.genre_id == Genre.id).exists())
            )
        ).scalars().all()
        if orphan_genres:
            await session.execute(delete(Genre).where(Genre.id.in_([g.id for g in orphan_genres])))

        await session.commit()

        removed_objects = 0
        for audio_key, cover_key in storage_keys:
            for key in (audio_key, cover_key):
                try:
                    storage.delete(key)
                    removed_objects += 1
                except Exception as error:  # noqa: BLE001 - best effort, dev storage
                    print(f"  ! could not delete {key}: {error}")

        after = await counts(session)

    print()
    report("Before", before)
    report("After ", after)
    print(f"\nstorage objects deleted: {removed_objects} (of {len(storage_keys) * 2})")
    leftover = [name for name in ("songs", "artists", "licenses") if after[name]]
    if leftover:
        print(f"WARNING: sample content still present in: {', '.join(leftover)}")
    else:
        print("No demo songs, artists, or licenses remain.")
    print(f"Accounts remaining: {after['users']} (the admin login used to reach /admin)")


if __name__ == "__main__":
    asyncio.run(main())

