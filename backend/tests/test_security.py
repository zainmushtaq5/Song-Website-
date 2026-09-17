"""Security/RBAC tests: admin protection, artist ownership, upload validation."""

from tests.conftest import MP3_BYTES, PNG_BYTES


def test_admin_endpoints_require_admin(client, auth_headers, user_headers) -> None:
    assert client.get("/api/admin/songs").status_code == 401  # no token
    assert client.get("/api/admin/songs", headers=auth_headers).status_code == 403  # artist
    assert client.get("/api/admin/songs", headers=user_headers).status_code == 403  # listener


def test_any_authenticated_user_can_upload(client, user_headers) -> None:
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    r = client.post(
        "/api/songs",
        data={"title": "Listener Upload"},
        files=files,
        headers=user_headers,
    )
    assert r.status_code == 201, r.text
    song = r.json()
    # artist profile auto-created from the username on first upload
    assert song["artist_name"] == "listener_one"


def test_upload_requires_authentication(client) -> None:
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    r = client.post("/api/songs", data={"title": "Anon"}, files=files)
    assert r.status_code == 401


def test_upload_rejects_wrong_mime(client, auth_headers) -> None:
    files = {"audio": ("track.mp3", MP3_BYTES, "video/mp4"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    r = client.post("/api/songs", data={"title": "Bad mime"}, files=files, headers=auth_headers)
    assert r.status_code == 422


def test_upload_rejects_mime_signature_mismatch(client, auth_headers) -> None:
    files = {"audio": ("track.mp3", b"definitely-not-audio" * 100, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    r = client.post("/api/songs", data={"title": "Bad signature"}, files=files, headers=auth_headers)
    assert r.status_code == 422


def test_download_flag_requires_license_type(client, auth_headers) -> None:
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    r = client.post(
        "/api/songs",
        data={"title": "No license", "download_allowed": "true"},
        files=files,
        headers=auth_headers,
    )
    assert r.status_code == 422


def test_other_license_requires_rights_note(client, auth_headers) -> None:
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    r = client.post(
        "/api/songs",
        data={"title": "Other license", "download_allowed": "true", "license_type": "other"},
        files=files,
        headers=auth_headers,
    )
    assert r.status_code == 422
    ok = client.post(
        "/api/songs",
        data={
            "title": "Other license ok",
            "download_allowed": "true",
            "license_type": "other",
            "rights_note": "written permission from rights holder",
        },
        files=files,
        headers=auth_headers,
    )
    assert ok.status_code == 201


def test_artist_cannot_see_or_act_on_others_pending_song(client, admin_headers, auth_headers) -> None:
    # artist uploads a song (PENDING)
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    song = client.post("/api/songs", data={"title": "Pending song"}, files=files, headers=auth_headers).json()

    # a second artist cannot view it (not public yet)
    client.post(
        "/api/auth/register",
        json={"email": "a2@test.dev", "username": "artist_two", "password": "password123", "is_artist": True},
    )
    other = client.post(
        "/api/auth/login", json={"email": "a2@test.dev", "password": "password123"}
    ).json()
    other_headers = {"Authorization": f"Bearer {other['access_token']}"}
    assert client.get(f"/api/songs/{song['id']}", headers=other_headers).status_code == 404

    # second artist cannot like/play/download it while pending
    assert client.post(f"/api/songs/{song['id']}/like", headers=other_headers).status_code == 404
    assert client.post(f"/api/songs/{song['id']}/download", headers=other_headers).status_code == 404
