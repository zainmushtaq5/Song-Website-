"""Search ranking tests: title > artist name > description, prefix boost, popularity tiebreak."""

from tests.conftest import MP3_BYTES, PNG_BYTES


def _artist_token(client, name="ranker_artist") -> str:
    """Register-or-login the ranking artist (DB is fresh per test)."""
    r = client.post(
        "/api/auth/register",
        json={"email": f"{name}@test.dev", "username": name, "password": "password123", "is_artist": True},
    )
    if r.status_code != 201:
        r = client.post("/api/auth/login", json={"email": f"{name}@test.dev", "password": "password123"})
    assert r.status_code in (200, 201), r.text
    return r.json()["access_token"]


def _song(client, artist_token, admin_headers, title, description=None) -> str:
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    data = {"title": title}
    if description:
        data["description"] = description
    song = client.post(
        "/api/songs", data=data, files=files, headers={"Authorization": f"Bearer {artist_token}"}
    ).json()
    r = client.post(f"/api/admin/songs/{song['id']}/approve", headers=admin_headers)
    assert r.status_code == 200, r.text
    return song["id"]


def _search_order(client, q) -> list[str]:
    results = client.get(f"/api/search?q={q}").json()
    return [s["title"] for s in results["songs"]]


def test_title_match_beats_description_match(client, auth_headers, admin_headers) -> None:
    tok = _artist_token(client)
    title_hit = _song(client, tok, admin_headers, "Aurora Skies")
    _song(client, tok, admin_headers, "Midnight Drive", description="featuring aurora sounds")

    order = _search_order(client, "aurora")
    assert order.index("Aurora Skies") < order.index("Midnight Drive"), order


def test_prefix_match_beats_later_contains(client, auth_headers, admin_headers) -> None:
    tok = _artist_token(client)
    prefix_hit = _song(client, tok, admin_headers, "Aurora Borealis")
    _song(client, tok, admin_headers, "Chasing the Aurora")

    order = _search_order(client, "aurora")
    assert order.index("Aurora Borealis") < order.index("Chasing the Aurora"), order


def test_popularity_breaks_ties(client, auth_headers, admin_headers, user_headers) -> None:
    """Same match type (neither exact), popularity decides."""
    tok = _artist_token(client)
    less_played = _song(client, tok, admin_headers, "Echoes One")
    more_played = _song(client, tok, admin_headers, "Echoes Two")

    client.post(f"/api/songs/{more_played}/play", headers=user_headers)
    client.post(f"/api/songs/{more_played}/play", headers=user_headers)

    order = _search_order(client, "echoes")
    assert order.index("Echoes Two") < order.index("Echoes One"), order


def test_artist_name_match_ranked(client, auth_headers, admin_headers) -> None:
    """A song whose ARTIST name matches the query (title unrelated) still surfaces."""
    tok = _artist_token(client)
    artist_song = _song(client, tok, admin_headers, "Totally Unrelated Title")

    results = client.get("/api/search?q=ranker_artist").json()
    assert any(s["id"] == artist_song for s in results["songs"]), results["songs"]


def test_exact_title_beats_partial_and_popularity(client, auth_headers, admin_headers, user_headers) -> None:
    tok = _artist_token(client)
    exact = _song(client, tok, admin_headers, "Firefly")
    _song(client, tok, admin_headers, "Firefly Nights")

    # give the partial match more plays than the exact match
    client.post(f"/api/songs/{_song_id(client, 'Firefly Nights')}/play", headers=user_headers)
    client.post(f"/api/songs/{_song_id(client, 'Firefly Nights')}/play", headers=user_headers)
    client.post(f"/api/songs/{_song_id(client, 'Firefly Nights')}/play", headers=user_headers)

    order = _search_order(client, "firefly")
    assert order.index("Firefly") < order.index("Firefly Nights"), order


def _song_id(client, title) -> str:
    results = client.get(f"/api/search?q={title}").json()
    return next(s["id"] for s in results["songs"] if s["title"] == title)
