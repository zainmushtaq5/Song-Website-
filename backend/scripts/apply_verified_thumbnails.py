import os
import sys
import json
import uuid
import sqlite3
import urllib.request
import urllib.parse

COVERS_STORAGE_DIR = os.path.join("backend", ".storage", "covers")
CACHE_DIR = os.path.join("frontend", "public", "downloaded_covers")
DB_PATH = os.path.join("backend", ".smoke.db")

os.makedirs(COVERS_STORAGE_DIR, exist_ok=True)
os.makedirs(CACHE_DIR, exist_ok=True)

# Load the matches from curated_search.json
with open("curated_matches.json", "r", encoding="utf-8") as f:
    matches = json.load(f)

# Hardcode the two Deezer / exact verified covers for the 2 missing ones
matches["51f251b2a64f409cb6c0d1ae8ae3f010"] = {
    "track": "Ja Muhabbat Tujhe Alvida Kehdia",
    "artist": "Sahir Ali Bagga",
    "album": "Ja Muhabbat Tujhe Alvida Kehdia",
    "artwork": "https://cdn-images.dzcdn.net/images/cover/4f29de932efffac9ea5c24026de08a17/500x500-000000-80-0-0.jpg"
}

matches["053e41f40fad47b48f234143aae93723"] = {
    "track": "Shaam Hai Dhuan Dhuan",
    "artist": "Ajay Devgn & Poornima",
    "album": "Diljale",
    "artwork": "https://cdn-images.dzcdn.net/images/cover/b951c2e441c4f3650bff5f31fb15d7f7/500x500-000000-80-0-0.jpg"
}

def download_img(url, dest):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = resp.read()
        if len(data) < 1000:
            raise ValueError(f"Downloaded file too small: {len(data)} bytes")
        with open(dest, "wb") as f:
            f.write(data)
        return data

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

cursor.execute("SELECT id, title, cover_key FROM songs WHERE status = 'APPROVED' AND deleted_at IS NULL ORDER BY created_at ASC")
songs = cursor.fetchall()

print(f"Total songs to update: {len(songs)}")

success_count = 0
failed_count = 0

for idx, (song_id, title, old_cover_key) in enumerate(songs, 1):
    info = matches.get(song_id)
    if not info or not info.get("artwork"):
        print(f"[{idx:02d}] [SKIP] No artwork info for {song_id}")
        failed_count += 1
        continue

    art_url = info["artwork"]
    ext = ".jpg"
    new_uuid = str(uuid.uuid4())
    filename = f"{new_uuid}{ext}"
    storage_path = os.path.join(COVERS_STORAGE_DIR, filename)
    cache_path = os.path.join(CACHE_DIR, f"{song_id}.jpg")

    try:
        data = download_img(art_url, storage_path)
        # Also save copy to cache
        with open(cache_path, "wb") as f:
            f.write(data)

        new_cover_key = f"covers/{filename}"

        # Update in database
        cursor.execute(
            "UPDATE songs SET cover_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (new_cover_key, song_id)
        )

        safe_track = info.get('track', 'Unknown').encode('ascii', 'replace').decode('ascii')
        safe_album = info.get('album', 'Unknown').encode('ascii', 'replace').decode('ascii')
        print(f"[{idx:02d}] [OK] {song_id[:8]} -> {safe_track} ({safe_album}) [{len(data)} B] -> {new_cover_key}")
        success_count += 1

    except Exception as e:
        print(f"[{idx:02d}] [FAIL] {song_id[:8]} -> Error: {e}")
        failed_count += 1

conn.commit()
conn.close()

print(f"\n==========================================")
print(f"COMPLETED: {success_count} updated successfully, {failed_count} failed.")
print(f"==========================================")
