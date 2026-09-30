import sqlite3
import asyncio
import asyncpg
import uuid
from datetime import datetime

NEON_URL = "postgresql://neondb_owner:npg_xr9TyQphC2Ze@ep-plain-poetry-b5hnw4na-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require"

def parse_uuid(val):
    if val is None:
        return None
    if isinstance(val, uuid.UUID):
        return val
    s = str(val).strip().replace("-", "")
    return uuid.UUID(hex=s)

def parse_dt(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    try:
        return datetime.fromisoformat(val)
    except Exception:
        return None

async def transfer():
    s_conn = sqlite3.connect("backend/.smoke.db")
    s_conn.row_factory = sqlite3.Row
    sc = s_conn.cursor()

    pg = await asyncpg.connect(NEON_URL)
    print("Connected to Neon. Transferring seed & catalog data...")

    # 1. users
    sc.execute("SELECT * FROM users")
    for r in sc.fetchall():
        await pg.execute("""
            INSERT INTO users (id, email, username, password_hash, role, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (id) DO NOTHING
        """, parse_uuid(r["id"]), r["email"], r["username"], r["password_hash"], r["role"], bool(r["is_active"]), parse_dt(r["created_at"]), parse_dt(r["updated_at"]))
    print("Users migrated.")

    # 2. artists
    sc.execute("SELECT * FROM artists")
    for r in sc.fetchall():
        await pg.execute("""
            INSERT INTO artists (id, user_id, name, slug, bio, avatar_url, deleted_at, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO NOTHING
        """, parse_uuid(r["id"]), parse_uuid(r["user_id"]), r["name"], r["slug"], r["bio"], r["avatar_url"], parse_dt(r["deleted_at"]), parse_dt(r["created_at"]), parse_dt(r["updated_at"]))
    print("Artists migrated.")

    # 3. genres
    sc.execute("SELECT * FROM genres")
    for r in sc.fetchall():
        await pg.execute("""
            INSERT INTO genres (id, name, slug, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO NOTHING
        """, parse_uuid(r["id"]), r["name"], r["slug"], parse_dt(r["created_at"]), parse_dt(r["updated_at"]))
    print("Genres migrated.")

    # 4. songs
    sc.execute("SELECT * FROM songs")
    for r in sc.fetchall():
        await pg.execute("""
            INSERT INTO songs (
                id, artist_id, genre_id, title, slug, description, audio_key, cover_key,
                duration_sec, bitrate_kbps, sample_rate, file_size_bytes, mime_type,
                play_count, download_count, like_count, download_allowed, license_type,
                rights_note, status, rejection_reason, deleted_at, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
            ON CONFLICT (id) DO NOTHING
        """, 
            parse_uuid(r["id"]), parse_uuid(r["artist_id"]), parse_uuid(r["genre_id"]),
            r["title"], r["slug"], r["description"], r["audio_key"], r["cover_key"],
            r["duration_sec"], r["bitrate_kbps"], r["sample_rate"], r["file_size_bytes"], r["mime_type"],
            r["play_count"], r["download_count"], r["like_count"], bool(r["download_allowed"]), r["license_type"],
            r["rights_note"], r["status"], r["rejection_reason"], parse_dt(r["deleted_at"]), parse_dt(r["created_at"]), parse_dt(r["updated_at"])
        )
    print("Songs migrated.")

    # 5. licenses
    sc.execute("SELECT * FROM licenses")
    for r in sc.fetchall():
        await pg.execute("""
            INSERT INTO licenses (
                id, song_id, status, license_type, rights_holder, proof_reference,
                effective_from, effective_until, reviewed_by, reviewed_at, review_note,
                action_reason, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT (id) DO NOTHING
        """,
            parse_uuid(r["id"]), parse_uuid(r["song_id"]), r["status"], r["license_type"], r["rights_holder"], r["proof_reference"],
            parse_dt(r["effective_from"]), parse_dt(r["effective_until"]), parse_uuid(r["reviewed_by"]), parse_dt(r["reviewed_at"]),
            r["review_note"], r["action_reason"], parse_dt(r["created_at"]), parse_dt(r["updated_at"])
        )
    print("Licenses migrated.")

    # Verify counts
    s_cnt = await pg.fetchval("SELECT count(*) FROM songs WHERE status = 'APPROVED'")
    print(f"Total active approved songs now in Neon PostgreSQL: {s_cnt}")

    await pg.close()
    s_conn.close()

asyncio.run(transfer())
