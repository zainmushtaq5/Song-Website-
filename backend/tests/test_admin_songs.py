"""Direct admin song management: PATCH edits (metadata, license fields, file
replacement + probe re-queue), DELETE soft-delete visibility, audit logging, RBAC.

Kept sync like the rest of the suite: DB coroutines run on their own loop/session
via asyncio.run (pytest-asyncio loop handling on Windows is fragile here).
"""

import asyncio

from sqlalchemy import select

from app.models.job import Job, JobStatus, JobType
from app.models.notification import Notification
from app.models.song import AdminAction, Song, SongStatus
from app.services.storage_service import storage
from tests.conftest import MP3_BYTES, PNG_BYTES, _TestSession

OTHER_AUDIO = b"ID3\x04\x00\x00\x00\x00\x00\x00" + b"\x11" * 4096


def _run_db(coro_fn):
    async def runner():
        async with _TestSession() as session:
            result = await coro_fn(session)
            await session.commit()
            return result

    return asyncio.run(runner())


def _row(song_id: str) -> Song:
    from uuid import UUID

    async def fn(session):
        return (await session.execute(select(Song).where(Song.id == UUID(song_id)))).scalar_one()

    return _run_db(fn)


def _delete(client, headers, song_id: str, *, reason: str | None = None):
    """TestClient.delete() takes no json= in this starlette version, so use request()."""
    return client.request(
        "DELETE",
        f"/api/admin/songs/{song_id}",
        json={"reason": reason} if reason else None,
        headers=headers,
    )


def _object_exists(key: str) -> bool:
    try:
        storage.read_bytes(key)
        return True
    except Exception:  # noqa: BLE001 - any storage failure means "not there"
        return False


def _patch(client, headers, song_id: str, *, data=None, files=None):
    return client.patch(f"/api/admin/songs/{song_id}", data=data or {}, files=files or {}, headers=headers)


def test_admin_edit_updates_metadata_and_logs_audit(client, approved_song, admin_headers) -> None:
    song_id = approved_song["id"]
    old_slug = approved_song["slug"]

    r = _patch(
        client,
        admin_headers,
        song_id,
        data={
            "title": "Renamed By Admin",
            "description": "Edited description",
            "genre": "Ambient",
            "license_type": "cc_by",
            "rights_note": "CC BY 4.0, admin verified",
            "download_allowed": "true",
            "note": "ticket 42",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["title"] == "Renamed By Admin"
    assert body["description"] == "Edited description"
    assert body["genre"] == "Ambient"
    assert body["license_type"] == "cc_by"
    assert body["rights_note"] == "CC BY 4.0, admin verified"
    # slug follows the title so the public URL cannot disagree with the page heading
    assert body["slug"].startswith("renamed-by-admin") and body["slug"] != old_slug
    assert body["status"] == "APPROVED"  # an edit is not a re-review
    assert _row(song_id).slug == body["slug"]

    async def audit(session):
        return (
            await session.execute(select(AdminAction).where(AdminAction.action == "song_edit"))
        ).scalars().all()

    rows = _run_db(audit)
    assert len(rows) == 1
    assert "title" in rows[0].reason and "license_type" in rows[0].reason
    assert "ticket 42" in rows[0].reason
    assert rows[0].target_id is not None and str(rows[0].target_id) == song_id


def test_edit_clears_optional_fields_with_empty_strings(client, approved_song, admin_headers) -> None:
    """Multipart edit semantics: absent = unchanged, "" = clear."""
    song_id = approved_song["id"]
    r = _patch(
        client,
        admin_headers,
        song_id,
        data={
            "title": "Kept Title",
            "description": "",
            "genre": "",
            "rights_note": "",
            "license_type": "",
            "download_allowed": "false",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["description"] is None
    assert body["genre"] is None
    assert body["rights_note"] is None
    assert body["license_type"] is None
    assert body["download_allowed"] is False
    # the license row the download gate reads stays in step with the song columns
    assert _row(song_id).license.license_type is None

    # a no-op edit writes no audit noise
    async def audit(session):
        return (await session.execute(select(AdminAction))).scalars().all()

    before = len(_run_db(audit))
    r = _patch(client, admin_headers, song_id, data={"title": "Kept Title"})
    assert r.status_code == 200
    assert len(_run_db(audit)) == before


def test_edit_enforces_the_upload_rules(client, approved_song, admin_headers) -> None:
    """An admin edit is not a way around the validation a fresh upload gets."""
    song_id = approved_song["id"]

    # downloads on, no license type
    r = _patch(client, admin_headers, song_id, data={"license_type": "", "download_allowed": "true"})
    assert r.status_code == 422
    # unknown license type
    assert _patch(client, admin_headers, song_id, data={"license_type": "nope"}).status_code == 422
    # license 'other' without a rights note
    r = _patch(client, admin_headers, song_id, data={"license_type": "other", "rights_note": ""})
    assert r.status_code == 422
    # empty title
    assert _patch(client, admin_headers, song_id, data={"title": "   "}).status_code == 422
    # declared type the app does not accept
    r = _patch(
        client, admin_headers, song_id, files={"audio": ("track.ogg", b"OggS" + b"\x00" * 512, "audio/ogg")}
    )
    assert r.status_code == 422
    # signature that contradicts the declared type (RIFF bytes sent as audio/mpeg)
    r = _patch(
        client,
        admin_headers,
        song_id,
        files={"audio": ("fake.mp3", b"RIFF\x00\x00\x00\x00WAVE" + b"\x00" * 512, "audio/mpeg")},
    )
    assert r.status_code == 422
    # cover that is not an image at all
    r = _patch(
        client, admin_headers, song_id, files={"cover": ("cover.png", b"not a png", "image/png")}
    )
    assert r.status_code == 422

    # nothing was applied and nothing was audited (the fixture's own approve row aside)
    fresh = client.get(f"/api/songs/{song_id}").json()
    assert fresh["title"] == approved_song["title"]
    assert fresh["license_type"] == approved_song["license_type"]

    async def audit(session):
        return (
            await session.execute(select(AdminAction).where(AdminAction.action == "song_edit"))
        ).scalars().all()

    assert _run_db(audit) == []


def test_audio_replacement_resets_metadata_and_requeues_probe(client, approved_song, admin_headers) -> None:
    from uuid import UUID

    song_id = approved_song["id"]

    # pretend the worker already probed the original file
    async def seed_metadata(session):
        song = (await session.execute(select(Song).where(Song.id == UUID(song_id)))).scalar_one()
        song.duration_sec, song.bitrate_kbps, song.sample_rate = 187, 320, 44100

    _run_db(seed_metadata)
    old_audio_key = _row(song_id).audio_key
    assert _object_exists(old_audio_key)

    r = _patch(client, admin_headers, song_id, files={"audio": ("new.mp3", OTHER_AUDIO, "audio/mpeg")})
    assert r.status_code == 200, r.text

    song = _row(song_id)
    assert song.audio_key != old_audio_key  # replacement is a new object, never an overwrite
    assert song.file_size_bytes == len(OTHER_AUDIO)
    # metadata described bytes that are gone: cleared, and the worker refills it
    assert (song.duration_sec, song.bitrate_kbps, song.sample_rate) == (0, None, None)
    assert not _object_exists(old_audio_key)
    assert _object_exists(song.audio_key)

    async def probe_jobs(session):
        return (
            await session.execute(
                select(Job).where(Job.type == JobType.PROBE_UPLOAD, Job.status == JobStatus.PENDING)
            )
        ).scalars().all()

    # the fixture's own upload left one pending probe; the edit must add exactly one more
    jobs = _run_db(probe_jobs)
    assert len(jobs) == 2
    new_job = next(job for job in jobs if song.audio_key in job.payload)
    assert song_id in new_job.payload

    # the audit entry records that the audio was swapped and re-queued
    async def edit_rows(session):
        return (
            await session.execute(select(AdminAction).where(AdminAction.action == "song_edit"))
        ).scalars().all()

    assert "audio" in _run_db(edit_rows)[0].reason


def test_cover_replacement_swaps_the_stored_object(client, approved_song, admin_headers) -> None:
    song_id = approved_song["id"]
    old_cover_key = _row(song_id).cover_key
    assert _object_exists(old_cover_key)

    new_cover = b"\x89PNG\r\n\x1a\n" + b"\x22" * 2048
    r = _patch(client, admin_headers, song_id, files={"cover": ("new-cover.png", new_cover, "image/png")})
    assert r.status_code == 200, r.text

    song = _row(song_id)
    assert song.cover_key != old_cover_key
    assert not _object_exists(old_cover_key)
    assert _object_exists(song.cover_key)
    assert r.json()["cover_url"] is not None
    # a cover swap leaves the audio metadata alone
    assert song.audio_key == approved_song["audio_url"].split("/media/")[1].split("?")[0]


def test_admin_delete_soft_deletes_and_hides_it_everywhere(
    client, approved_song, admin_headers, auth_headers, user_headers
) -> None:
    song_id = approved_song["id"]
    slug = approved_song["slug"]

    # the song is reachable through every public surface first
    playlist = client.post("/api/playlists", json={"name": "Delete Me Mix"}, headers=user_headers).json()
    assert (
        client.post(f"/api/playlists/{playlist['id']}/songs", json={"song_id": song_id}, headers=user_headers).status_code
        == 201
    )
    assert client.get("/api/songs").json()[0]["id"] == song_id
    assert client.get(f"/api/playlists/{playlist['slug']}").json()["song_count"] == 1

    r = _delete(client, admin_headers, song_id, reason="Copyright claim")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "REMOVED"

    # gone from feed, search, playlists and detail pages on the next request
    assert [s["id"] for s in client.get("/api/songs").json()] == []
    assert client.get(f"/api/songs/{song_id}").status_code == 404
    assert client.get(f"/api/songs/by-slug/{slug}").status_code == 404
    assert client.get("/api/search?q=Test").json()["songs"] == []
    assert client.get(f"/api/playlists/{playlist['slug']}").json()["song_count"] == 0
    assert client.get("/api/songs/mine", headers=auth_headers).json() == []

    # soft, not hard: the row survives with deleted_at set, and the queue hides it
    row = _row(song_id)
    assert row.deleted_at is not None and row.status == SongStatus.REMOVED
    assert all(s["id"] != song_id for s in client.get("/api/admin/songs?review_status=ALL", headers=admin_headers).json())

    # auditing + the owner is told
    async def audit(session):
        return (
            await session.execute(select(AdminAction).where(AdminAction.action == "song_delete"))
        ).scalars().all()

    async def notifications(session):
        return (
            await session.execute(select(Notification).where(Notification.type == "song_removed"))
        ).scalars().all()

    rows = _run_db(audit)
    assert len(rows) == 1 and rows[0].reason == "Copyright claim"
    notes = _run_db(notifications)
    assert len(notes) == 1 and "Copyright claim" in notes[0].message

    # deleting or editing it again is a 404, not a silent success
    assert _delete(client, admin_headers, song_id).status_code == 404
    assert _patch(client, admin_headers, song_id, data={"title": "Zombie"}).status_code == 404


def test_direct_management_is_admin_only(client, approved_song, auth_headers, user_headers) -> None:
    song_id = approved_song["id"]
    for headers in (auth_headers, user_headers):
        assert _patch(client, headers, song_id, data={"title": "Hijacked"}).status_code == 403
        assert _delete(client, headers, song_id).status_code == 403
    # anonymous callers get 401, not 403
    assert _patch(client, {}, song_id, data={"title": "Hijacked"}).status_code == 401
    assert _delete(client, {}, song_id).status_code == 401

    # the song is untouched by the rejected attempts
    fresh = client.get(f"/api/songs/{song_id}").json()
    assert fresh["title"] == approved_song["title"] and fresh["status"] == "APPROVED"
    assert _row(song_id).deleted_at is None


def test_admin_song_list_filters(client, auth_headers, admin_headers, approved_song) -> None:
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    pending = client.post("/api/songs", data={"title": "Awaiting Review"}, files=files, headers=auth_headers).json()

    # default queue stays PENDING-only (the review workflow the admin already had)
    queue = client.get("/api/admin/songs", headers=admin_headers).json()
    assert [s["id"] for s in queue] == [pending["id"]]

    # ALL is what the management view uses: any status, newest first
    everything = client.get("/api/admin/songs?review_status=ALL", headers=admin_headers).json()
    assert {s["id"] for s in everything} == {pending["id"], approved_song["id"]}
    # newest first; SQLite's CURRENT_TIMESTAMP is second-resolution, so compare stamps
    # rather than assuming the two uploads landed in different seconds.
    stamps = [s["created_at"] for s in everything]
    assert stamps == sorted(stamps, reverse=True)

    # filters are case-insensitive and validated
    assert client.get("/api/admin/songs?review_status=approved", headers=admin_headers).json()[0]["id"] == approved_song["id"]
    assert client.get("/api/admin/songs?review_status=BOGUS", headers=admin_headers).status_code == 422
