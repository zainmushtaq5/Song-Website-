"""Notification tests: triggers (approve/reject/follow), list, unread count, read-all."""

from tests.conftest import MP3_BYTES, PNG_BYTES


def _uploaded_song(client, auth_headers, title="Notify Song") -> str:
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    song = client.post("/api/songs", data={"title": title}, files=files, headers=auth_headers).json()
    return song["id"]


def test_list_requires_auth(client) -> None:
    assert client.get("/api/notifications").status_code == 401
    assert client.post("/api/notifications/read-all").status_code == 401


def test_empty_notifications_initially(client, auth_headers) -> None:
    r = client.get("/api/notifications", headers=auth_headers)
    body = r.json()
    assert r.status_code == 200
    assert body["notifications"] == [] and body["unread_count"] == 0


def test_approval_creates_notification_for_owner(client, auth_headers, admin_headers) -> None:
    song_id = _uploaded_song(client, auth_headers)
    client.post(f"/api/admin/songs/{song_id}/approve", headers=admin_headers)

    body = client.get("/api/notifications", headers=auth_headers).json()
    assert body["unread_count"] == 1
    n = body["notifications"][0]
    assert n["type"] == "song_approved"
    assert "approved" in n["message"] and n["is_read"] is False


def test_rejection_creates_notification_with_reason(client, auth_headers, admin_headers) -> None:
    song_id = _uploaded_song(client, auth_headers)
    client.post(
        f"/api/admin/songs/{song_id}/reject",
        json={"rejection_reason": "Wrong credits"},
        headers=admin_headers,
    )

    body = client.get("/api/notifications", headers=auth_headers).json()
    n = body["notifications"][0]
    assert n["type"] == "song_rejected"
    assert "Wrong credits" in n["message"]


def test_follow_creates_notification_for_artist(client, user_headers) -> None:
    # artist registers + uploads so there is an artist profile to follow
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    song = client.post("/api/songs", data={"title": "Follow Notify"}, files=files, headers=user_headers).json()

    # a second user follows the artist (artist is a USER role here, artist profile exists)
    client.post(
        "/api/auth/register",
        json={"email": "nf@test.dev", "username": "nf_follower", "password": "password123"},
    )
    follower = client.post("/api/auth/login", json={"email": "nf@test.dev", "password": "password123"}).json()
    r = client.post(f"/api/artists/{song['artist_slug']}/follow", headers={"Authorization": f"Bearer {follower['access_token']}"})
    assert r.status_code == 200

    # the song uploader (artist user) got the notification
    body = client.get("/api/notifications", headers=user_headers).json()
    n = body["notifications"][0]
    assert n["type"] == "new_follower"
    assert "nf_follower" in n["message"]


def test_no_notification_for_unfollow(client, user_headers) -> None:
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    song = client.post("/api/songs", data={"title": "Unfollow Notify"}, files=files, headers=user_headers).json()
    client.post(
        "/api/auth/register",
        json={"email": "nfu@test.dev", "username": "nfu_follower", "password": "password123"},
    )
    follower = client.post("/api/auth/login", json={"email": "nfu@test.dev", "password": "password123"}).json()
    fheaders = {"Authorization": f"Bearer {follower['access_token']}"}
    client.post(f"/api/artists/{song['artist_slug']}/follow", headers=fheaders)
    client.post(f"/api/artists/{song['artist_slug']}/follow", headers=fheaders)  # unfollow

    body = client.get("/api/notifications", headers=user_headers).json()
    # only the original follow notification; unfollow adds nothing
    assert body["unread_count"] == 1
    assert all(n["type"] == "new_follower" for n in body["notifications"])


def test_read_all_clears_unread(client, auth_headers, admin_headers) -> None:
    for title in ("N1", "N2"):
        song_id = _uploaded_song(client, auth_headers, title)
        client.post(f"/api/admin/songs/{song_id}/approve", headers=admin_headers)

    before = client.get("/api/notifications", headers=auth_headers).json()
    assert before["unread_count"] == 2

    r = client.post("/api/notifications/read-all", headers=auth_headers)
    assert r.json()["marked"] == 2

    after = client.get("/api/notifications", headers=auth_headers).json()
    assert after["unread_count"] == 0
    assert len(after["notifications"]) == 2
    assert all(n["is_read"] for n in after["notifications"])
