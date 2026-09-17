"""Core loop tests: upload -> approve -> feed -> play -> download -> like -> search."""

from uuid import UUID

from tests.conftest import MP3_BYTES, PNG_BYTES


def test_upload_appears_pending_then_visible_after_approval(client, auth_headers, admin_headers) -> None:
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    song = client.post("/api/songs", data={"title": "Loop Song"}, files=files, headers=auth_headers).json()
    assert song["status"] == "PENDING"

    # not on public feed while pending
    feed = client.get("/api/songs").json()
    assert all(s["id"] != song["id"] for s in feed)
    # not publicly visible
    assert client.get(f"/api/songs/{song['id']}").status_code == 404

    # admin sees it in review list
    review = client.get("/api/admin/songs?review_status=PENDING", headers=admin_headers).json()
    assert any(s["id"] == song["id"] for s in review)

    # approve
    r = client.post(f"/api/admin/songs/{song['id']}/approve", headers=admin_headers)
    assert r.status_code == 200 and r.json()["status"] == "APPROVED"

    # now public
    assert client.get(f"/api/songs/{song['id']}").status_code == 200
    feed = client.get("/api/songs").json()
    assert any(s["id"] == song["id"] for s in feed)


def test_reject_flow_records_reason(client, auth_headers, admin_headers) -> None:
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    song = client.post("/api/songs", data={"title": "Reject Me"}, files=files, headers=auth_headers).json()
    r = client.post(
        f"/api/admin/songs/{song['id']}/reject",
        json={"rejection_reason": "Poor audio quality"},
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert r.json()["rejection_reason"] == "Poor audio quality"
    # artist sees rejection on their uploads list
    mine = client.get("/api/songs/mine", headers=auth_headers).json()
    entry = next(s for s in mine if s["id"] == song["id"])
    assert entry["status"] == "REJECTED"


def test_artist_sees_own_uploads_with_statuses(client, auth_headers) -> None:
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    client.post("/api/songs", data={"title": "Mine 1"}, files=files, headers=auth_headers)
    client.post("/api/songs", data={"title": "Mine 2"}, files=files, headers=auth_headers)
    mine = client.get("/api/songs/mine", headers=auth_headers).json()
    assert len(mine) == 2 and all(s["status"] == "PENDING" for s in mine)


def test_play_and_download_and_like(client, approved_song, user_headers) -> None:
    sid = approved_song["id"]
    UUID(sid)

    play = client.post(f"/api/songs/{sid}/play", headers=user_headers)
    assert play.status_code == 200 and play.json()["play_count"] == approved_song["play_count"] + 1

    like = client.post(f"/api/songs/{sid}/like", headers=user_headers)
    assert like.json() == {"liked": True}
    assert client.post(f"/api/songs/{sid}/like", headers=user_headers).json() == {"liked": False}  # unlike

    dl = client.post(f"/api/songs/{sid}/download", headers=user_headers)
    assert dl.status_code == 200
    url = dl.json()["download_url"]
    assert "sig=" in url  # signed URL

    # anonymous download forbidden
    assert client.post(f"/api/songs/{sid}/download").status_code == 401


def test_download_blocked_when_not_allowed(client, auth_headers, admin_headers, user_headers) -> None:
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    song = client.post(
        "/api/songs", data={"title": "Streaming Only"}, files=files, headers=auth_headers
    ).json()
    client.post(f"/api/admin/songs/{song['id']}/approve", headers=admin_headers)
    r = client.post(f"/api/songs/{song['id']}/download", headers=user_headers)
    assert r.status_code == 403


def test_download_requires_auth(client, approved_song) -> None:
    assert client.post(f"/api/songs/{approved_song['id']}/download").status_code == 401


def test_likes_list_and_feed_trending(client, approved_song, user_headers) -> None:
    sid = approved_song["id"]
    client.post(f"/api/songs/{sid}/like", headers=user_headers)
    likes = client.get("/api/users/me/likes", headers=user_headers).json()
    assert any(s["id"] == sid for s in likes)

    # plays make it trending
    client.post(f"/api/songs/{sid}/play")
    client.post(f"/api/songs/{sid}/play")
    trending = client.get("/api/songs?sort=trending").json()
    assert trending[0]["id"] == sid


def test_search_finds_songs_and_artists(client, approved_song, user_headers) -> None:
    r = client.get("/api/search?q=Test Song").json()
    assert any(s["id"] == approved_song["id"] for s in r["songs"])
    r = client.get("/api/search?q=artist_one").json()
    assert any(a["slug"].startswith("artist-one") for a in r["artists"])
    # short queries return empty
    assert client.get("/api/search?q=T").json()["songs"] == []


def test_artist_page_shows_approved_songs(client, approved_song) -> None:
    slug = approved_song["artist_slug"]
    r = client.get(f"/api/artists/{slug}")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == approved_song["artist_name"]
    assert any(s["id"] == approved_song["id"] for s in body["songs"])
    assert client.get("/api/artists/does-not-exist").status_code == 404


def test_signed_media_url_roundtrip(client, approved_song) -> None:
    cover_url = approved_song["cover_url"]
    assert cover_url and "sig=" in cover_url
    path = cover_url.split("/media")[1]
    r = client.get(f"/media{path}")
    assert r.status_code == 200
    # tampered signature rejected
    r = client.get(f"/media{path.split('sig=')[0]}sig=00000000000000000000000000000000&ttl=900")
    assert r.status_code == 403


def test_song_by_slug_public_lookup(client, approved_song) -> None:
    r = client.get(f"/api/songs/by-slug/{approved_song['slug']}")
    assert r.status_code == 200
    assert r.json()["id"] == approved_song["id"]

    # unknown slug → 404
    assert client.get("/api/songs/by-slug/does-not-exist").status_code == 404


def test_song_by_slug_hidden_while_pending(client, auth_headers) -> None:
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    song = client.post("/api/songs", data={"title": "Slug Pending"}, files=files, headers=auth_headers).json()
    assert client.get(f"/api/songs/by-slug/{song['slug']}").status_code == 404
