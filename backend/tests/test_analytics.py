"""Analytics tests: totals, 7/30-day windows, top songs, isolation, RBAC."""

from tests.conftest import MP3_BYTES, PNG_BYTES


def _upload(client, auth_headers, admin_headers, title, download_allowed=False):
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    data = {"title": title}
    if download_allowed:
        data.update({"download_allowed": "true", "license_type": "artist_owned"})
    song = client.post("/api/songs", data=data, files=files, headers=auth_headers).json()
    client.post(f"/api/admin/songs/{song['id']}/approve", headers=admin_headers)
    if download_allowed:
        lics = client.get("/api/admin/licenses", headers=admin_headers).json()
        lic = next(l for l in lics if l["song_id"] == song["id"])
        client.post(f"/api/admin/licenses/{lic['id']}/approve", headers=admin_headers, json={})
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

def test_window_validation(client, auth_headers) -> None:
    for bad in ("0", "8", "91", "-7"):
        r = client.get(f"/api/users/me/analytics?window={bad}", headers=auth_headers)
        assert r.status_code == 422, bad
    for ok in ("7", "30", "90"):
        assert client.get(f"/api/users/me/analytics?window={ok}", headers=auth_headers).status_code == 200


def test_series_shape_and_counts(client, auth_headers, admin_headers, user_headers) -> None:
    song = _upload(client, auth_headers, admin_headers, "Series Song", download_allowed=True)
    for _ in range(3):
        assert client.post(f"/api/songs/{song['id']}/play", headers=user_headers).status_code == 200
    assert client.post(f"/api/songs/{song['id']}/like", headers=user_headers).status_code == 200
    for _ in range(2):
        assert client.post(f"/api/songs/{song['id']}/download", headers=user_headers).status_code == 200

    body = client.get("/api/users/me/analytics?window=7", headers=auth_headers).json()
    assert body["window"] == 7
    series = body["series"]
    assert len(series) == 7

    # dates are contiguous ascending and end today (UTC)
    from datetime import UTC, datetime, timedelta

    today = datetime.now(UTC).date()
    expected = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    assert [d["date"] for d in series] == expected

    # all of today's activity lands in the last bucket
    last = series[-1]
    assert (last["plays"], last["likes"], last["downloads"]) == (3, 1, 2)
    assert sum(d["plays"] for d in series) == 3

    # 30/90-day windows: correct length, same totals
    for w in ("30", "90"):
        wide = client.get(f"/api/users/me/analytics?window={w}", headers=auth_headers).json()
        assert len(wide["series"]) == int(w)
        assert sum(d["plays"] for d in wide["series"]) == 3
        assert wide["totals"]["plays"] == 4 or wide["totals"]["plays"] == 3  # only this song exists


def test_series_zeros_without_songs(client, auth_headers) -> None:
    body = client.get("/api/users/me/analytics?window=90", headers=auth_headers).json()
    assert len(body["series"]) == 90
    assert all(d["plays"] == 0 and d["likes"] == 0 and d["downloads"] == 0 for d in body["series"])


def test_song_analytics_owner_only(client, auth_headers, admin_headers, user_headers) -> None:
    song = _upload(client, auth_headers, admin_headers, "Drilldown Song", download_allowed=True)
    assert client.post(f"/api/songs/{song['id']}/play", headers=user_headers).status_code == 200
    assert client.post(f"/api/songs/{song['id']}/play", headers=user_headers).status_code == 200

    # owner sees per-song series
    r = client.get(f"/api/users/me/analytics/songs/{song['id']}?window=7", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["song"]["id"] == song["id"]
    assert body["song"]["title"] == "Drilldown Song"
    assert body["totals"]["plays"] == 2
    assert len(body["series"]) == 7
    assert body["series"][-1]["plays"] == 2

    # other authenticated users cannot see someone else's song analytics
    assert client.get(f"/api/users/me/analytics/songs/{song['id']}", headers=user_headers).status_code == 403
    # unknown song -> 404
    from uuid import uuid4

    assert client.get(f"/api/users/me/analytics/songs/{uuid4()}", headers=auth_headers).status_code == 404
    # invalid window -> 422
    assert client.get(f"/api/users/me/analytics/songs/{song['id']}?window=8", headers=auth_headers).status_code == 422
