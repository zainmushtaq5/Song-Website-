"""Authentication module tests: register, login, refresh, me, RBAC."""

from tests.conftest import MP3_BYTES, PNG_BYTES


def test_health(client) -> None:
    assert client.get("/api/health").json() == {"status": "ok"}


def test_register_user_and_artist(client) -> None:
    r = client.post(
        "/api/auth/register",
        json={"email": "u1@test.dev", "username": "user_one", "password": "password123"},
    )
    assert r.status_code == 201
    tokens = r.json()
    assert tokens["access_token"] and tokens["refresh_token"]

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert me.status_code == 200
    assert me.json()["role"] == "USER"

    r = client.post(
        "/api/auth/register",
        json={"email": "a1@test.dev", "username": "artist_1", "password": "password123", "is_artist": True},
    )
    assert r.status_code == 201
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert me.json()["role"] == "ARTIST"


def test_register_duplicate_email_and_username(client) -> None:
    payload = {"email": "dup@test.dev", "username": "dup_user", "password": "password123"}
    assert client.post("/api/auth/register", json=payload).status_code == 201
    assert client.post("/api/auth/register", json=payload).status_code == 409
    assert (
        client.post(
            "/api/auth/register",
            json={"email": "other@test.dev", "username": "DUP_USER", "password": "password123"},
        ).status_code
        == 409
    )


def test_register_reserved_username_and_weak_password(client) -> None:
    r = client.post(
        "/api/auth/register",
        json={"email": "r1@test.dev", "username": "admin", "password": "password123"},
    )
    assert r.status_code == 422
    r = client.post(
        "/api/auth/register",
        json={"email": "r2@test.dev", "username": "weak_pw", "password": "short"},
    )
    assert r.status_code == 422


def test_login_success_and_failure(client) -> None:
    client.post(
        "/api/auth/register",
        json={"email": "login@test.dev", "username": "login_user", "password": "password123"},
    )
    ok = client.post(
        "/api/auth/login", json={"email": "LOGIN@test.dev", "password": "password123"}
    )
    assert ok.status_code == 200
    bad = client.post("/api/auth/login", json={"email": "login@test.dev", "password": "wrong-password"})
    assert bad.status_code == 401


def test_refresh_token_flow(client) -> None:
    tokens = client.post(
        "/api/auth/register",
        json={"email": "ref@test.dev", "username": "ref_user", "password": "password123"},
    ).json()
    r = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    access = r.json()["access_token"]
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {access}"}).status_code == 200

    # access token cannot be used as refresh
    bad = client.post("/api/auth/refresh", json={"refresh_token": tokens["access_token"]})
    assert bad.status_code == 401

    # garbage token
    assert client.post("/api/auth/refresh", json={"refresh_token": "garbage"}).status_code == 401


def test_me_requires_token(client) -> None:
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-jwt"}).status_code == 401
