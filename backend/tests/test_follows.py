"""Follows feature tests: toggle, follower counts, following list, RBAC."""

import sys

from tests.conftest import MP3_BYTES, PNG_BYTES


def test_windows_selector_event_loop_policy_is_set() -> None:
    """Regression: Proactor loop kills uvicorn on client disconnects (WinError 10054).

    app.main must switch Windows to the selector event loop policy at import time.
    """
    if sys.platform != "win32":
        return  # Linux/macOS don't have the Proactor loop — nothing to assert
    import asyncio

    from asyncio import WindowsSelectorEventLoopPolicy

    # importing app.main applies the policy as an import side effect
    import app.main  # noqa: F401

    assert type(asyncio.get_event_loop_policy()) is WindowsSelectorEventLoopPolicy


def _artist_slug(client, auth_headers) -> str:
    """Create an artist (with one approved song) and return the artist slug."""
    r = client.post(
        "/api/auth/register",
        json={"email": "follow-artist@test.dev", "username": "follow_artist", "password": "password123", "is_artist": True},
    )
    assert r.status_code == 201, r.text
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    song = client.post("/api/songs", data={"title": "Follow Song"}, files=files, headers=auth_headers).json()
    return song["artist_slug"]


def test_follow_requires_auth(client) -> None:
    r = client.post("/api/artists/some-slug/follow")
    assert r.status_code == 401


def test_follow_nonexistent_artist_404(client, user_headers) -> None:
    r = client.post("/api/artists/does-not-exist/follow", headers=user_headers)
    assert r.status_code == 404


def test_follow_toggle_and_follower_count(client, user_headers, admin_headers, auth_headers) -> None:
    slug = _artist_slug(client, auth_headers)

    r = client.post(f"/api/artists/{slug}/follow", headers=user_headers)
    assert r.status_code == 200 and r.json() == {"following": True}

    page = client.get(f"/api/artists/{slug}").json()
    assert page["follower_count"] == 1

    # second follower
    r2 = client.post(f"/api/artists/{slug}/follow", headers=admin_headers)
    assert r2.json() == {"following": True}
    assert client.get(f"/api/artists/{slug}").json()["follower_count"] == 2

    # is_following is per-caller
    assert client.get(f"/api/artists/{slug}", headers=user_headers).json()["is_following"] is True
    assert client.get(f"/api/artists/{slug}").json()["is_following"] is False

    # unfollow
    assert client.post(f"/api/artists/{slug}/follow", headers=user_headers).json() == {"following": False}
    page = client.get(f"/api/artists/{slug}").json()
    assert page["follower_count"] == 1
    assert page["is_following"] is False


def test_cannot_follow_yourself(client, auth_headers) -> None:
    """The artist following their own profile is rejected."""
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    song = client.post("/api/songs", data={"title": "Self Song"}, files=files, headers=auth_headers).json()
    slug = song["artist_slug"]
    r = client.post(f"/api/artists/{slug}/follow", headers=auth_headers)
    assert r.status_code == 422


def test_me_following_list(client, user_headers, auth_headers) -> None:
    empty = client.get("/api/users/me/following", headers=user_headers)
    assert empty.status_code == 200 and empty.json() == []

    slug = _artist_slug(client, auth_headers)
    client.post(f"/api/artists/{slug}/follow", headers=user_headers)

    following = client.get("/api/users/me/following", headers=user_headers).json()
    assert len(following) == 1
    assert following[0]["slug"] == slug
    assert "name" in following[0] and "avatar_url" in following[0]

    # unfollow -> list empties
    client.post(f"/api/artists/{slug}/follow", headers=user_headers)
    assert client.get("/api/users/me/following", headers=user_headers).json() == []


def test_following_requires_auth(client) -> None:
    assert client.get("/api/users/me/following").status_code == 401
