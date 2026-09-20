"""Playlist feature tests: create, add/remove songs, visibility, ownership."""

from uuid import uuid4

from tests.conftest import MP3_BYTES, PNG_BYTES


def _approved_song(client, auth_headers, admin_headers, title="Playlist Song") -> str:
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    song = client.post(f"/api/songs", data={"title": title}, files=files, headers=auth_headers).json()
    r = client.post(f"/api/admin/songs/{song['id']}/approve", headers=admin_headers)
    assert r.status_code == 200, r.text
    return song["id"]


def _create_playlist(client, headers, name="My Mix") -> dict:
    r = client.post("/api/playlists", json={"name": name, "description": "test mix"}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_create_requires_auth(client) -> None:
    assert client.post("/api/playlists", json={"name": "X"}).status_code == 401


def test_create_and_list_mine(client, auth_headers) -> None:
    pl = _create_playlist(client, auth_headers, "Road Trip")
    assert pl["slug"].startswith("road-trip") and pl["is_public"] is True

    mine = client.get("/api/playlists/mine", headers=auth_headers).json()
    assert len(mine) == 1
    assert mine[0]["name"] == "Road Trip" and mine[0]["song_count"] == 0


def test_add_approved_song_and_detail(client, auth_headers, admin_headers) -> None:
    song_id = _approved_song(client, auth_headers, admin_headers)
    pl = _create_playlist(client, auth_headers)
    pid = pl["id"]
    slug = pl["slug"]

    r = client.post(f"/api/playlists/{pid}/songs", json={"song_id": song_id}, headers=auth_headers)
    assert r.status_code == 201, r.text

    detail = client.get(f"/api/playlists/{slug}").json()
    assert detail["song_count"] == 1
    assert detail["songs"][0]["id"] == song_id
    assert detail["songs"][0]["status"] == "APPROVED"
    assert detail["cover_url"] is not None  # derived from first song
    assert detail["owner"] == "artist_one"


def test_cannot_add_unapproved_song(client, auth_headers) -> None:
    # a PENDING song from another artist must not be addable
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    pending = client.post("/api/songs", data={"title": "Still Pending"}, files=files, headers=auth_headers).json()

    pl = _create_playlist(client, auth_headers)
    r = client.post(f"/api/playlists/{pl['id']}/songs", json={"song_id": pending["id"]}, headers=auth_headers)
    assert r.status_code == 404


def test_cannot_add_duplicate_song(client, auth_headers, admin_headers) -> None:
    song_id = _approved_song(client, auth_headers, admin_headers)
    pl = _create_playlist(client, auth_headers)
    client.post(f"/api/playlists/{pl['id']}/songs", json={"song_id": song_id}, headers=auth_headers)
    r = client.post(f"/api/playlists/{pl['id']}/songs", json={"song_id": song_id}, headers=auth_headers)
    assert r.status_code == 409


def test_only_owner_can_modify(client, auth_headers, user_headers, admin_headers) -> None:
    song_id = _approved_song(client, auth_headers, admin_headers)
    pl = _create_playlist(client, auth_headers)
    pid = pl["id"]

    # other user cannot add / update / delete
    assert client.post(f"/api/playlists/{pid}/songs", json={"song_id": song_id}, headers=user_headers).status_code == 403
    assert client.patch(f"/api/playlists/{pid}", json={"name": "Hijacked"}, headers=user_headers).status_code == 403
    assert client.delete(f"/api/playlists/{pid}", headers=user_headers).status_code == 403

    # nonexistent playlist -> 404 even for authed user
    assert client.post(f"/api/playlists/{uuid4()}/songs", json={"song_id": song_id}, headers=auth_headers).status_code == 404


def test_owner_can_remove_song(client, auth_headers, admin_headers) -> None:
    song_id = _approved_song(client, auth_headers, admin_headers)
    pl = _create_playlist(client, auth_headers)
    pid = pl["id"]
    client.post(f"/api/playlists/{pid}/songs", json={"song_id": song_id}, headers=auth_headers)

    r = client.delete(f"/api/playlists/{pid}/songs/{song_id}", headers=auth_headers)
    assert r.status_code == 204
    assert client.get(f"/api/playlists/{pl['slug']}").json()["song_count"] == 0

    # removing again -> 404
    assert client.delete(f"/api/playlists/{pid}/songs/{song_id}", headers=auth_headers).status_code == 404


def test_private_playlist_hidden_from_others(client, auth_headers, user_headers) -> None:
    pl = _create_playlist(client, auth_headers, "Secret Mix")
    client.patch(f"/api/playlists/{pl['id']}", json={"is_public": False}, headers=auth_headers)

    # anon + other user get 404; owner sees it
    assert client.get(f"/api/playlists/{pl['slug']}").status_code == 404
    assert client.get(f"/api/playlists/{pl['slug']}", headers=user_headers).status_code == 404
    assert client.get(f"/api/playlists/{pl['slug']}", headers=auth_headers).status_code == 200


def test_update_and_delete_playlist(client, auth_headers) -> None:
    pl = _create_playlist(client, auth_headers)
    pid = pl["id"]

    r = client.patch(f"/api/playlists/{pid}", json={"name": "Renamed", "description": "new desc", "is_public": False}, headers=auth_headers)
    assert r.status_code == 200 and r.json()["name"] == "Renamed"
    mine = client.get("/api/playlists/mine", headers=auth_headers).json()
    assert mine[0]["name"] == "Renamed" and mine[0]["is_public"] is False

    r = client.delete(f"/api/playlists/{pid}", headers=auth_headers)
    assert r.status_code == 204
    assert client.get(f"/api/playlists/{pl['slug']}", headers=auth_headers).status_code == 404
    assert client.get("/api/playlists/mine", headers=auth_headers).json() == []


def test_invalid_playlist_and_song_ids(client, auth_headers) -> None:
    r = client.post("/api/playlists", json={"name": "OK"}, headers=auth_headers)
    pid = r.json()["id"]
    assert client.post(f"/api/playlists/{pid}/songs", json={"song_id": str(uuid4())}, headers=auth_headers).status_code == 404
    assert client.get("/api/playlists/no-such-playlist").status_code == 404
