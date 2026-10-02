from datetime import UTC, datetime, timedelta
from uuid import uuid4, UUID

from fastapi import HTTPException, Request, UploadFile, status
from sqlalchemy import case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.rate_limit import enforce_rate_limit
from app.models.engagement import Download, Like, Play, PlaySource
from app.models.song import Genre, LicenseType, Song, SongStatus
from app.models.user import Artist, User
from app.schemas.song import SongOut
from app.services.storage_service import storage
from app.utils.slug import unique_slug

ALLOWED_AUDIO_TYPES = {"audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/wav": ".wav"}
ALLOWED_COVER_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def validate_upload_file(fileobj: UploadFile, allowed: dict[str, str], kind: str) -> None:
    if fileobj.content_type not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported {kind} type: {fileobj.content_type}",
        )


def validate_file_signature(head: bytes, content_type: str) -> None:
    """Reject files whose magic bytes contradict the declared MIME type."""
    ok = {
        "audio/mpeg": head[:3] == b"ID3" or head[:2] == b"\xff\xfb",
        "audio/mp4": head[4:8] == b"ftyp",
        "audio/wav": head[:4] == b"RIFF" and head[8:12] == b"WAVE",
        "image/jpeg": head[:2] == b"\xff\xd8",
        "image/png": head[:8] == b"\x89PNG\r\n\x1a\n",
        "image/webp": head[:4] == b"RIFF" and head[8:12] == b"WEBP",
    }.get(content_type, False)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File content does not match its declared type",
        )


async def get_artist_by_user(db: AsyncSession, user: User) -> Artist | None:
    result = await db.execute(select(Artist).where(Artist.user_id == user.id))
    return result.scalar_one_or_none()


async def get_or_create_artist(db: AsyncSession, user: User) -> Artist:
    """Any authenticated user can upload; an artist profile is created on first upload."""
    artist = await get_artist_by_user(db, user)
    if artist is None:
        artist = Artist(user_id=user.id, name=user.username, slug=unique_slug(user.username, 120))
        db.add(artist)
        await db.flush()
    return artist

async def ensure_genre(db: AsyncSession, name: str | None) -> Genre | None:
    if not name:
        return None
    from app.utils.slug import slugify

    slug = slugify(name, 100)
    result = await db.execute(select(Genre).where(Genre.slug == slug))
    genre = result.scalar_one_or_none()
    if genre is None:
        genre = Genre(name=name.strip()[:80], slug=slug)
        db.add(genre)
        await db.flush()
    return genre


def _license_check(download_allowed: bool, license_type: LicenseType | None, rights_note: str | None) -> None:
    if download_allowed and license_type is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="license_type is required when downloads are allowed",
        )
    if download_allowed and license_type == LicenseType.OTHER and not (rights_note or "").strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="rights_note is required for license_type 'other'",
        )


class BytesAdapter:
    """Minimal file-adapter over bytes for storage.upload."""

    def __init__(self, data: bytes) -> None:
        self._data = data
        self._pos = 0

    def read(self, n: int = -1) -> bytes:
        if n == -1:
            out = self._data[self._pos :]
            self._pos = len(self._data)
        else:
            out = self._data[self._pos : self._pos + n]
            self._pos += n
        return out

    def seek(self, pos: int, whence: int = 0) -> None:
        self._pos = min(pos if whence == 0 else len(self._data), len(self._data))


async def create_song(
    db: AsyncSession,
    request: Request,
    user: User,
    meta,
    audio: UploadFile,
    cover: UploadFile,
) -> Song:
    await enforce_rate_limit(request, "upload", str(user.id))
    artist = await get_or_create_artist(db, user)
    validate_upload_file(audio, ALLOWED_AUDIO_TYPES, "audio")
    validate_upload_file(cover, ALLOWED_COVER_TYPES, "cover image")
    _license_check(meta.download_allowed, meta.license_type, meta.rights_note)

    audio_head = await audio.read(16)
    validate_file_signature(audio_head, audio.content_type or "")
    await audio.seek(0)
    cover_head = await cover.read(16)
    validate_file_signature(cover_head, cover.content_type or "")
    await cover.seek(0)

    audio_bytes = await audio.read(settings.MAX_AUDIO_BYTES + 1)
    if len(audio_bytes) > settings.MAX_AUDIO_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Audio file too large")
    cover_bytes = await cover.read(settings.MAX_COVER_BYTES + 1)
    if len(cover_bytes) > settings.MAX_COVER_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Cover image too large")

    song_id = uuid4()
    ext = ALLOWED_AUDIO_TYPES[audio.content_type or "audio/mpeg"]
    cext = ALLOWED_COVER_TYPES[cover.content_type or "image/jpeg"]
    audio_key = f"audio/{song_id}{ext}"
    cover_key = f"covers/{song_id}{cext}"

    from app.utils.audio import probe_duration

    dur, br, sr = probe_duration(audio_bytes)
    genre = await ensure_genre(db, meta.genre)
    song = Song(
        id=song_id,
        artist_id=artist.id,
        genre_id=genre.id if genre else None,
        title=meta.title.strip(),
        slug=unique_slug(meta.title, 240),
        description=meta.description,
        audio_key=audio_key,
        cover_key=cover_key,
        duration_sec=dur or 0,
        bitrate_kbps=br,
        sample_rate=sr,
        file_size_bytes=len(audio_bytes),
        mime_type=audio.content_type,
        download_allowed=meta.download_allowed,
        license_type=meta.license_type,
        rights_note=meta.rights_note,
        status=SongStatus.PENDING,
    )
    # Set relationships eagerly so serialization never triggers lazy IO.
    song.artist = artist
    song.genre = genre
    db.add(song)
    await db.flush()
    from app.services.license_service import create_initial_license

    await create_initial_license(db, song, meta.license_type.value if meta.license_type else None)
    storage.upload(audio_key, BytesAdapter(audio_bytes), audio.content_type or "application/octet-stream")
    storage.upload(cover_key, BytesAdapter(cover_bytes), cover.content_type or "application/octet-stream")
    # Move FFmpeg probing off the request thread: enqueue a durable job.
    from app.models.job import JobType
    from app.services.job_service import enqueue

    await enqueue(db, JobType.PROBE_UPLOAD, {"song_id": str(song_id), "audio_key": audio_key})
    return song

async def create_song_direct(
    db: AsyncSession,
    request: Request,
    user: User,
    meta,
    song_id: UUID,
    audio_key: str,
    cover_key: str,
    audio_type: str,
    audio_size: int,
    duration_sec: int = 0,
) -> Song:
    await enforce_rate_limit(request, "upload", str(user.id))
    artist = await get_or_create_artist(db, user)
    _license_check(meta.download_allowed, meta.license_type, meta.rights_note)

    genre = await ensure_genre(db, meta.genre)
    song = Song(
        id=song_id,
        artist_id=artist.id,
        genre_id=genre.id if genre else None,
        title=meta.title.strip(),
        slug=unique_slug(meta.title, 240),
        description=meta.description,
        audio_key=audio_key,
        cover_key=cover_key,
        duration_sec=duration_sec,
        bitrate_kbps=0,
        sample_rate=0,
        file_size_bytes=audio_size,
        mime_type=audio_type,
        download_allowed=meta.download_allowed,
        license_type=meta.license_type,
        rights_note=meta.rights_note,
        status=SongStatus.PENDING,
    )
    song.artist = artist
    song.genre = genre
    db.add(song)
    await db.flush()
    from app.services.license_service import create_initial_license
    await create_initial_license(db, song, meta.license_type.value if meta.license_type else None)
    
    from app.models.job import JobType
    from app.services.job_service import enqueue
    await enqueue(db, JobType.PROBE_UPLOAD, {"song_id": str(song_id), "audio_key": audio_key})
    return song


async def _read_replacement(file: UploadFile, allowed: dict[str, str], kind: str, max_bytes: int) -> tuple[bytes, str]:
    """Validate a replacement file exactly like a fresh upload, and read it.

    Same three gates as create_song: declared MIME type, magic bytes, and size. An
    admin edit must not become a way to smuggle a file past the rules an upload obeys.
    """
    validate_upload_file(file, allowed, kind)
    head = await file.read(16)
    validate_file_signature(head, file.content_type or "")
    await file.seek(0)
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"{kind.capitalize()} file too large",
        )
    return data, allowed[file.content_type or ""]


def _editable_text(value: str | None, field: str, max_length: int, *, allow_clear: bool) -> str | None:
    """Multipart edit semantics: None = field absent = unchanged, "" = clear.

    Validation lives here rather than in the route so every admin surface that calls
    the service enforces the same rules.
    """
    if value is None:
        return None
    value = value.strip()
    if not value:
        if not allow_clear:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{field} cannot be empty"
            )
        return None
    if len(value) > max_length:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{field} is too long"
        )
    return value


async def admin_update_song(
    db: AsyncSession,
    song: Song,
    *,
    title: str | None = None,
    description: str | None = None,
    genre: str | None = None,
    license_type_raw: str | None = None,
    rights_note: str | None = None,
    download_allowed: bool | None = None,
    audio: UploadFile | None = None,
    cover: UploadFile | None = None,
) -> tuple[list[str], bool]:
    """Apply a direct admin edit to any song. Returns (changed fields, audio replaced).

    Audio is the interesting case: a replacement is a new object at a new key, the old
    one is deleted, and the metadata columns are cleared and re-probed by the worker —
    the same path a fresh upload takes, so an admin-replaced file can never keep the
    previous file's duration/bitrate.
    """
    changed: list[str] = []

    new_title = _editable_text(title, "title", 200, allow_clear=False)
    if new_title is not None and new_title != song.title:
        song.title = new_title
        # Slugs are derived from titles at creation; keep that relationship instead of
        # letting the public URL silently disagree with the page heading.
        song.slug = unique_slug(new_title, 240)
        changed.append("title")

    new_description = _editable_text(description, "description", 5000, allow_clear=True)
    if description is not None and new_description != song.description:
        song.description = new_description
        changed.append("description")

    if genre is not None:
        new_genre = await ensure_genre(db, _editable_text(genre, "genre", 80, allow_clear=True))
        if (new_genre.id if new_genre else None) != song.genre_id:
            song.genre_id = new_genre.id if new_genre else None
            song.genre = new_genre
            changed.append("genre")

    license_type = song.license_type
    if license_type_raw is not None:
        raw = license_type_raw.strip()
        if raw:
            try:
                license_type = LicenseType(raw)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Invalid license type: {license_type_raw}",
                )
        else:
            license_type = None  # "" clears the license (streaming-only)

    if rights_note is not None:
        new_rights_note = _editable_text(rights_note, "rights_note", 2000, allow_clear=True)
    else:
        new_rights_note = song.rights_note
    downloads = song.download_allowed if download_allowed is None else download_allowed

    # Same rule the upload endpoint enforces: allowing downloads requires a license
    # type, and "other" is meaningless without a rights note.
    if download_allowed is not None or license_type_raw is not None or rights_note is not None:
        _license_check(downloads, license_type, new_rights_note)

    if license_type != song.license_type:
        song.license_type = license_type
        # The license row drives the download gate and the UI badge, so it has to agree
        # with the song columns the admin just edited.
        if song.license is not None:
            song.license.license_type = license_type.value if license_type else None
        changed.append("license_type")
    if rights_note is not None and new_rights_note != song.rights_note:
        song.rights_note = new_rights_note
        changed.append("rights_note")
    if downloads != song.download_allowed:
        song.download_allowed = downloads
        changed.append("download_allowed")

    new_audio_key: str | None = None
    if audio is not None:
        data, ext = await _read_replacement(audio, ALLOWED_AUDIO_TYPES, "audio", settings.MAX_AUDIO_BYTES)
        new_audio_key = f"audio/{uuid4()}{ext}"
        storage.upload(new_audio_key, BytesAdapter(data), audio.content_type or "application/octet-stream")
        old_audio_key = song.audio_key
        song.audio_key = new_audio_key
        song.file_size_bytes = len(data)
        song.mime_type = audio.content_type
        # The stored metadata describes bytes that no longer exist: clear it and let the
        # worker refill it, exactly like a fresh upload.
        song.duration_sec = 0
        song.bitrate_kbps = None
        song.sample_rate = None
        _delete_quietly(old_audio_key)
        changed.append("audio")

    if cover is not None:
        data, ext = await _read_replacement(cover, ALLOWED_COVER_TYPES, "cover image", settings.MAX_COVER_BYTES)
        new_cover_key = f"covers/{uuid4()}{ext}"
        storage.upload(new_cover_key, BytesAdapter(data), cover.content_type or "application/octet-stream")
        _delete_quietly(song.cover_key)
        song.cover_key = new_cover_key
        changed.append("cover")

    await db.flush()

    if new_audio_key is not None:
        from app.models.job import JobType
        from app.services.job_service import enqueue

        # Same durable job a fresh upload queues, so the new file gets probed even if
        # this request's response is lost.
        await enqueue(db, JobType.PROBE_UPLOAD, {"song_id": str(song.id), "audio_key": new_audio_key})

    return changed, new_audio_key is not None


def _delete_quietly(key: str) -> None:
    """Best effort object cleanup: a leaked object is better than a failed edit."""
    try:
        storage.delete(key)
    except Exception:  # noqa: BLE001
        pass


async def admin_soft_delete(db: AsyncSession, song: Song) -> None:
    """Soft-delete a song: gone from feed, search, playlists and detail pages at once.

    Every public read path already filters `deleted_at IS NULL`, so setting it is what
    makes the removal immediate; status REMOVED records why the row is gone for an
    admin looking at it later.
    """
    song.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    song.status = SongStatus.REMOVED
    await db.flush()



def cover_url(cover_key: str | None) -> str | None:
    if not cover_key:
        return None
    # If CDN_URL is set (e.g. Cloudflare R2 public bucket), serve directly — no boto3 needed.
    if settings.CDN_URL:
        return f"{settings.CDN_URL.rstrip('/')}/{cover_key}"
    try:
        return storage.presigned_get_url(cover_key, ttl=3600)
    except Exception:
        return None


def _cover_url(song: Song) -> str | None:
    return cover_url(song.cover_key)


def _audio_url(song: Song) -> str | None:
    if not song.audio_key:
        return None
    # If CDN_URL is set (e.g. Cloudflare R2 public bucket), serve directly — no boto3 needed.
    if settings.CDN_URL:
        return f"{settings.CDN_URL.rstrip('/')}/{song.audio_key}"
    try:
        return storage.presigned_get_url(song.audio_key, ttl=600)
    except Exception:
        return None


def to_song_out(song: Song) -> SongOut:
    from app.services.license_service import license_status_now

    return SongOut(
        cover_url=_cover_url(song),
        audio_url=_audio_url(song),
        genre=song.genre.name if song.genre else None,
        artist_name=song.artist.name if song.artist else None,
        artist_slug=song.artist.slug if song.artist else None,
        id=song.id,
        title=song.title,
        slug=song.slug,
        description=song.description,
        duration_sec=song.duration_sec,
        bitrate_kbps=song.bitrate_kbps,
        sample_rate=song.sample_rate,
        play_count=song.play_count,
        download_count=song.download_count,
        like_count=song.like_count,
        download_allowed=song.download_allowed,
        license_type=song.license_type,
        rights_note=song.rights_note,
        status=song.status,
        artist_id=song.artist_id,
        created_at=song.created_at,
        license_status=license_status_now(song.license),
    )


async def list_public_songs(
    db: AsyncSession,
    sort: str = "recent",
    page: int = 1,
    page_size: int = 20,
    genre: str | None = None,
) -> list[Song]:
    stmt = select(Song).where(Song.status == SongStatus.APPROVED, Song.deleted_at.is_(None))
    if genre:
        stmt = stmt.join(Genre, Song.genre_id == Genre.id).where(
            (Genre.slug == genre) | (func.lower(Genre.name) == func.lower(genre))
        )
    if sort == "trending":
        # Phase 2: time-weighted score over the last 7 days.
        # score = plays*1 + likes*3 + downloads*5 (recent only), then lifetime
        # play_count as tiebreaker so older songs with no recent activity still
        # surface in a stable order instead of vanishing.
        week_ago = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=7)
        plays_7 = (
            select(func.count())
            .select_from(Play)
            .where(Play.song_id == Song.id, Play.created_at >= week_ago)
            .correlate(Song)
            .scalar_subquery()
        )
        likes_7 = (
            select(func.count())
            .select_from(Like)
            .where(Like.song_id == Song.id, Like.created_at >= week_ago)
            .correlate(Song)
            .scalar_subquery()
        )
        downloads_7 = (
            select(func.count())
            .select_from(Download)
            .where(Download.song_id == Song.id, Download.created_at >= week_ago)
            .correlate(Song)
            .scalar_subquery()
        )
        score = plays_7 * 1 + likes_7 * 3 + downloads_7 * 5
        stmt = stmt.order_by(desc(score), desc(Song.play_count))
    else:
        stmt = stmt.order_by(desc(Song.created_at))
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_public_song(db: AsyncSession, song_id) -> Song:
    song = await db.get(Song, song_id)
    if song is None or song.deleted_at is not None or song.status != SongStatus.APPROVED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not found")
    return song


async def get_owned_song(db: AsyncSession, song_id, user: User) -> Song:
    song = await db.get(Song, song_id)
    if song is None or song.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Song not found")
    if not user.is_admin():
        artist = await get_artist_by_user(db, user)
        if artist is None or song.artist_id != artist.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your song")
    return song


async def record_play(db: AsyncSession, request: Request, song_id, user: User | None, source: PlaySource) -> Song:
    await enforce_rate_limit(request, "play", str(user.id) if user else None)
    song = await get_public_song(db, song_id)
    db.add(Play(song_id=song.id, user_id=user.id if user else None, source=source))
    song.play_count += 1
    await db.flush()
    return song


async def record_download(db: AsyncSession, request: Request, song_id, user: User) -> str:
    await enforce_rate_limit(request, "download", str(user.id))
    song = await get_public_song(db, song_id)
    if not song.download_allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Downloads not allowed for this song")
    from app.models.license import LicenseStatus
    from app.services.license_service import license_status_now
    if license_status_now(song.license) != LicenseStatus.APPROVED:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="License is not approved for downloads")
    db.add(Download(song_id=song.id, user_id=user.id))
    song.download_count += 1
    await db.flush()
    return storage.presigned_get_url(song.audio_key)


async def toggle_like(db: AsyncSession, request: Request, song_id, user: User) -> bool:
    await enforce_rate_limit(request, "like", str(user.id))
    song = await get_public_song(db, song_id)
    existing = (
        await db.execute(select(Like).where(Like.user_id == user.id, Like.song_id == song.id))
    ).scalar_one_or_none()
    if existing:
        await db.delete(existing)
        song.like_count -= 1
        liked = False
    else:
        db.add(Like(user_id=user.id, song_id=song.id))
        song.like_count += 1
        liked = True
    await db.flush()
    return liked


async def user_likes(db: AsyncSession, user: User) -> list[Song]:
    stmt = (
        select(Song)
        .join(Like, Like.song_id == Song.id)
        .where(Like.user_id == user.id, Song.status == SongStatus.APPROVED, Song.deleted_at.is_(None))
        .order_by(desc(Like.created_at))
    )
    return list((await db.execute(stmt)).scalars().all())


async def artist_uploads(db: AsyncSession, user: User) -> list[Song]:
    artist = await get_artist_by_user(db, user)
    if artist is None:
        return []
    stmt = (
        select(Song)
        .where(Song.artist_id == artist.id, Song.deleted_at.is_(None))
        .order_by(desc(Song.created_at))
    )
    return list((await db.execute(stmt)).scalars().all())


async def search(db: AsyncSession, request: Request, q: str) -> tuple[list[Song], list[Artist]]:
    """Weighted search.

    Song score (portable SQL, works on SQLite and Postgres):
      exact title match      +50
      title contains         +40
      title prefix           +30 (additional)
      artist name contains   +25
      artist name prefix     +15 (additional)
      description contains   +10
      popularity             play_count * 0.01 + like_count * 0.05 (tiebreaker)
    Artists are ordered by name-prefix match first, then contains.
    """
    await enforce_rate_limit(request, "search")
    q = q.strip()
    if not q or len(q) < 2:
        return [], []

    needle = func.lower(q)
    contains = func.lower(f"%{q}%")
    prefix = func.lower(f"{q}%")

    title_exact = case((func.lower(Song.title) == needle, 50), else_=0)
    title_has = case((func.lower(Song.title).like(contains), 40), else_=0)
    title_prefix = case((func.lower(Song.title).like(prefix), 30), else_=0)
    artist_has = case((func.lower(Artist.name).like(contains), 25), else_=0)
    artist_prefix = case((func.lower(Artist.name).like(prefix), 15), else_=0)
    desc_has = case((func.lower(Song.description).like(contains), 10), else_=0)
    popularity = Song.play_count * 0.01 + Song.like_count * 0.05

    score = title_exact + title_has + title_prefix + artist_has + artist_prefix + desc_has + popularity

    songs = (
        await db.execute(
            select(Song)
            .join(Artist, Song.artist_id == Artist.id)
            .where(
                Song.status == SongStatus.APPROVED,
                Song.deleted_at.is_(None),
                or_(
                    func.lower(Song.title).like(contains),
                    func.lower(Song.description).like(contains),
                    func.lower(Artist.name).like(contains),
                ),
            )
            .order_by(desc(score), desc(Song.play_count), desc(Song.created_at))
            .limit(20)
        )
    ).scalars().all()

    artist_prefix_first = case((func.lower(Artist.name).like(prefix), 1), else_=0)
    artists = (
        await db.execute(
            select(Artist)
            .where(Artist.deleted_at.is_(None), func.lower(Artist.name).like(contains))
            .order_by(desc(artist_prefix_first), func.lower(Artist.name))
            .limit(10)
        )
    ).scalars().all()
    return list(songs), list(artists)