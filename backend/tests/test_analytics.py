"""Analytics tests: totals, 7/30-day windows, top songs, isolation, RBAC."""

from tests.conftest import MP3_BYTES, PNG_BYTES


def _upload(client, auth_headers, admin_headers, title, download_allowed=False):
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    data = {"title": title}
    if download_allowed:
        data.update({"download_allowed": "true", "license_type": "artist_owned"})
    song = client.post("/api/songs", data=data, files=files, headers=auth_headers).json()
    client.post(f"/api/admin/songs/{song['id']}/approve", headers=admin_headers)
    return song


def test_analytics_requires_auth(client) -> None:
    assert client.get("/api/users/me/analytics").status_code == 401


def test_zeros_for_user_without_songs(client, auth_headers) -> None:
    body = client.get("/api/users/me/analytics", headers=auth_headers).json()
    assert body["song_count"] == 0
    assert body["totals"] == {"plays": 0, "downloads": 0, "likes": 0}
    assert body["last_7_days"] == {"plays": 0, "downloads": 0}
    assert body["top_songs"] == []


def test_totals_and_top_songs_with_real_activity(client, auth_headers, admin_headers, user_headers) -> None:
    song_a = _upload(client, auth_headers, admin_headers, "Analytics Hit", download_allowed=True)
    song_b = _upload(client, auth_headers, admin_headers, "Analytics Quiet")

    # activity: 3 plays on A, 1 play on B, 1 download of A, 1 like on A
    for _ in range(3):
        assert client.post(f"/api/songs/{song_a['id']}/play", headers=user_headers).status_code == 200
    assert client.post(f"/api/songs/{song_b['id']}/play", headers=user_headers).status_code == 200
    dl = client.post(f"/api/songs/{song_a['id']}/download", headers=user_headers)
    assert dl.status_code == 200
    assert client.post(f"/api/songs/{song_a['id']}/like", headers=user_headers).json()["liked"] is True

    body = client.get("/api/users/me/analytics", headers=auth_headers).json()
    assert body["song_count"] == 2
    assert body["totals"] == {"plays": 4, "downloads": 1, "likes": 1}
    # all activity is recent -> 7-day window equals totals
    assert body["last_7_days"]["plays"] == 4
    assert body["last_7_days"]["downloads"] == 1
    assert body["last_30_days"]["plays"] == 4

    # top songs ordered by plays: A (3) before B (1)
    assert body["top_songs"][0]["title"] == "Analytics Hit"
    assert body["top_songs"][0]["plays"] == 3
    assert body["top_songs"][0]["downloads"] == 1
    assert body["top_songs"][0]["likes"] == 1
    assert body["top_songs"][1]["title"] == "Analytics Quiet"


def test_analytics_isolated_between_artists(client, auth_headers, admin_headers, user_headers) -> None:
    _upload(client, auth_headers, admin_headers, "Artist One Song")
    client.post(
        "/api/auth/register",
        json={"email": "pl-other@test.dev", "username": "pl_other_artist", "password": "password123", "is_artist": True},
    )
    other = client.post("/api/auth/login", json={"email": "pl-other@test.dev", "password": "password123"}).json()
    other_headers = {"Authorization": f"Bearer {other['access_token']}"}
    _upload(client, other_headers, admin_headers, "Artist Two Song")

    body1 = client.get("/api/users/me/analytics", headers=auth_headers).json()
    assert body1["song_count"] == 1
    assert body1["top_songs"][0]["title"] == "Artist One Song"

    body2 = client.get("/api/users/me/analytics", headers=other_headers).json()
    assert body2["song_count"] == 1
    assert body2["top_songs"][0]["title"] == "Artist Two Song"


def test_pending_song_activity_not_counted(client, auth_headers) -> None:
    """A PENDING song can't be played publicly, so it contributes nothing."""
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    song = client.post("/api/songs", data={"title": "Never Approved"}, files=files, headers=auth_headers).json()
    client.post(f"/api/songs/{song['id']}/play")  # anon play on pending -> 404

    body = client.get("/api/users/me/analytics", headers=auth_headers).json()
    assert body["totals"]["plays"] == 0
