"""Recommendation engine tests: genre/artist signals, exclusions, fallback,
artist suggestions, anon behavior."""

from tests.conftest import MP3_BYTES, PNG_BYTES


def _upload(client, auth_headers, admin_headers, title, genre=None):
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    data = {"title": title}
    if genre:
        data["genre"] = genre
    song = client.post("/api/songs", data=data, files=files, headers=auth_headers).json()
    client.post(f"/api/admin/songs/{song['id']}/approve", headers=admin_headers)
    return song


def _login(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": "password123"}).json()
    return {"Authorization": f"Bearer {r['access_token']}"}


def _register(client, username):
    client.post(
        "/api/auth/register",
        json={
            "email": f"{username}@rec.example.com",
            "username": username,
            "password": "password123",
            "is_artist": True,
        },
    )
    return _login(client, f"{username}@rec.example.com")


def _setup_artists(client, admin_headers):
    a1 = _register(client, "rec_artist1")
    a2 = _register(client, "rec_artist2")
    pop1 = _upload(client, a1, admin_headers, "Pop One", genre="Pop")
    pop2 = _upload(client, a2, admin_headers, "Pop Two", genre="Pop")
    metal = _upload(client, a2, admin_headers, "Metal One", genre="Metal")
    return a1, a2, pop1, pop2, metal


def test_anonymous_gets_popular_mix(client, admin_headers) -> None:
    a1, a2, pop1, pop2, metal = _setup_artists(client, admin_headers)
    r = client.get("/api/recommendations")
    assert r.status_code == 200
    body = r.json()
    assert len(body["songs"]) >= 3
    assert body["artists"] == []  # no signals -> no artist suggestions
    assert all(s["status"] == "APPROVED" for s in body["songs"])


def test_genre_signal_ranks_matching_songs_first(client, admin_headers, user_headers) -> None:
    a1, a2, pop1, pop2, metal = _setup_artists(client, admin_headers)
    # listener likes the Pop song by artist1
    assert client.post(f"/api/songs/{pop1['id']}/like", headers=user_headers).json()["liked"] is True

    body = client.get("/api/recommendations", headers=user_headers).json()
    titles = [s["title"] for s in body["songs"]]
    assert titles[0] == "Pop Two"  # genre match beats non-matching
    assert "Pop One" not in titles  # already liked -> excluded


def test_artist_signal_and_artist_suggestions(client, admin_headers, user_headers) -> None:
    a1, a2, pop1, pop2, metal = _setup_artists(client, admin_headers)
    # listener plays artist2's metal song -> artist2 becomes a top artist signal
    for _ in range(3):
        assert client.post(f"/api/songs/{metal['id']}/play", headers=user_headers).status_code == 200

    body = client.get("/api/recommendations", headers=user_headers).json()
    titles = [s["title"] for s in body["songs"]]
    assert "Metal One" not in titles  # played songs are excluded from recs
    # artist suggestions include artist2 (their songs are in the listener's top genres? no -)
    # artist2's songs are Metal (played) -> top genre Metal; pop2 is Pop -> genre Pop
    # artist2 appears in artist suggestions only if their songs match a top genre (Metal yes)
    assert any(a["name"] == "rec_artist2" for a in body["artists"])


def test_own_songs_and_self_excluded_for_artist(client, admin_headers) -> None:
    a1, a2, pop1, pop2, metal = _setup_artists(client, admin_headers)
    body = client.get("/api/recommendations", headers=a1).json()
    titles = [s["title"] for s in body["songs"]]
    assert "Pop One" not in titles  # own song excluded
    assert all(a["slug"] != "rec_artist1" for a in body["artists"])  # self excluded


def test_limit_param_respected(client, admin_headers, user_headers) -> None:
    a1, a2, pop1, pop2, metal = _setup_artists(client, admin_headers)
    body = client.get("/api/recommendations?limit=1", headers=user_headers).json()
    assert len(body["songs"]) == 1


def test_user_without_signals_gets_popular_fallback(client, admin_headers) -> None:
    _setup_artists(client, admin_headers)
    fresh = _register(client, "rec_fresh")
    body = client.get("/api/recommendations", headers=fresh).json()
    assert len(body["songs"]) >= 3
    assert body["artists"] == []