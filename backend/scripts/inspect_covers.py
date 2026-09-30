import sqlite3
import os
import sys

conn = sqlite3.connect('backend/.smoke.db')
c = conn.cursor()
c.execute('SELECT id, title, cover_key FROM songs WHERE status = "APPROVED" AND deleted_at IS NULL')
rows = c.fetchall()

print(f"Total approved songs: {len(rows)}")
for idx, (song_id, title, cover_key) in enumerate(rows, 1):
    p = os.path.join('backend', '.storage', cover_key.replace('/', os.sep))
    exists = os.path.exists(p)
    size = os.path.getsize(p) if exists else 0
    safe_title = title.encode('ascii', 'replace').decode('ascii')
    print(f"[{idx:02d}] ID: {song_id} | exists: {exists} ({size} B) | Cover: {cover_key} | Title: {safe_title}")
