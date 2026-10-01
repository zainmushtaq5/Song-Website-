from unittest.mock import AsyncMock, patch


def test_lookup_metadata_requires_auth(client):
    resp = client.get("/api/songs/lookup-metadata?title=Faded")
    assert resp.status_code == 401


def test_lookup_metadata_requires_title(client, auth_headers):
    resp = client.get("/api/songs/lookup-metadata?title=", headers=auth_headers)
    assert resp.status_code == 422


def test_lookup_metadata_success(client, auth_headers):
    mock_result = {
        "song_name": "Faded",
        "artist_name": "Alan Walker",
        "album": "Different World",
        "genre": "Electronic",
        "cover_url": "https://example.com/cover.jpg",
        "cover_data_url": "data:image/jpeg;base64,mockbase64data",
        "license_type": "artist_owned",
        "download_allowed": False,
        "description": "Artist: Alan Walker · Album: Different World · Genre: Electronic",
        "tags": ["electronic", "dance"],
        "sources": ["itunes"],
    }

    with patch("app.services.metadata_service.lookup_song_metadata", new=AsyncMock(return_value=mock_result)):
        resp = client.get("/api/songs/lookup-metadata?title=Faded", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["song_name"] == "Faded"
        assert data["genre"] == "Electronic"
        assert data["license_type"] == "artist_owned"
        assert data["cover_data_url"] == "data:image/jpeg;base64,mockbase64data"
