"""Song metadata lookup service.

Uses public, no-API-key-required endpoints:
1. iTunes Search API (fast, reliable 600x600 cover artwork, canonical genre and artist)
2. Deezer API (broad international / regional / indie catalogue, 500x500 cover artwork)
3. MusicBrainz API (deep tags, community genre categorization, license hints)

Fetches and merges metadata and optionally fetches the cover image bytes to return
a ready-to-use base64 data URL so the client can convert it to a File object directly
without CORS issues.
"""

import base64
import logging
import urllib.parse
from typing import Any

import httpx

log = logging.getLogger(__name__)

_ITUNES_BASE = "https://itunes.apple.com/search"
_DEEZER_BASE = "https://api.deezer.com/search"
_MB_BASE = "https://musicbrainz.org/ws/2"
_HEADERS = {"User-Agent": "SongsWebsite/1.0 (contact@songswebsite.example)"}
_TIMEOUT = 7.0  # seconds

# Keywords indicating royalty-free or creative commons
_ROYALTY_FREE_KEYWORDS = {
    "royalty free", "royalty-free", "nocopyrightsounds", "ncs", "kevin macleod",
    "incompetech", "public domain", "free music archive", "freemusic", "epidemic sound",
    "bensound", "audiolibrary", "stock music", "free download"
}
_CC_KEYWORDS = {
    "creative commons", "cc by", "cc-by", "ccby", "attribution", "cc by-sa", "cc0"
}


def _infer_license_type(title: str, artist: str, tags: list[str]) -> tuple[str, bool]:
    """Determine license type and whether download should be allowed.

    Returns (license_type, download_allowed).
    """
    text = f"{title} {artist} {' '.join(tags)}".lower()

    for kw in _ROYALTY_FREE_KEYWORDS:
        if kw in text:
            return "royalty_free", True

    for kw in _CC_KEYWORDS:
        if kw in text:
            return "cc_by", True

    # Default to artist_owned for general music
    return "artist_owned", False


def _clean_genre(genre: str | None) -> str | None:
    if not genre:
        return None
    g = genre.strip()
    # Normalize common iTunes labels
    mappings = {
        "Hip-Hop/Rap": "Hip-Hop",
        "Hip Hop": "Hip-Hop",
        "R&B/Soul": "R&B",
        "Electronic/Dance": "Electronic",
        "Dance": "Electronic",
        "Hard Rock": "Rock",
        "Classic Rock": "Rock",
        "Alt Rock": "Alternative",
        "Alternative Rock": "Alternative",
    }
    return mappings.get(g, g)


async def _search_itunes(query: str, client: httpx.AsyncClient) -> dict[str, Any]:
    params = urllib.parse.urlencode({"term": query, "media": "music", "limit": "3", "entity": "song"})
    url = f"{_ITUNES_BASE}?{params}"
    try:
        resp = await client.get(url)
        if resp.status_code != 200:
            return {}
        data = resp.json()
        results = data.get("results", [])
        if not results:
            return {}
        track = results[0]
        artwork = track.get("artworkUrl100")
        if artwork:
            artwork = artwork.replace("100x100bb", "600x600bb")
        return {
            "title": track.get("trackName"),
            "artist": track.get("artistName"),
            "album": track.get("collectionName"),
            "genre": _clean_genre(track.get("primaryGenreName")),
            "cover_url": artwork,
            "source": "itunes",
        }
    except Exception as exc:  # noqa: BLE001
        log.warning("iTunes lookup error for %r: %s", query, exc)
        return {}


async def _search_deezer(query: str, client: httpx.AsyncClient) -> dict[str, Any]:
    params = urllib.parse.urlencode({"q": query, "limit": "3"})
    url = f"{_DEEZER_BASE}?{params}"
    try:
        resp = await client.get(url)
        if resp.status_code != 200:
            return {}
        data = resp.json()
        items = data.get("data", [])
        if not items:
            return {}
        track = items[0]
        album = track.get("album", {})
        artist = track.get("artist", {})
        artwork = album.get("cover_big") or album.get("cover_medium") or album.get("cover_xl")
        return {
            "title": track.get("title"),
            "artist": artist.get("name"),
            "album": album.get("title"),
            "cover_url": artwork,
            "source": "deezer",
        }
    except Exception as exc:  # noqa: BLE001
        log.warning("Deezer lookup error for %r: %s", query, exc)
        return {}


async def _search_musicbrainz(query: str, client: httpx.AsyncClient) -> dict[str, Any]:
    params = urllib.parse.urlencode({
        "query": f'recording:"{query}"',
        "fmt": "json",
        "limit": "3",
    })
    url = f"{_MB_BASE}/recording?{params}"
    try:
        resp = await client.get(url)
        if resp.status_code != 200:
            return {}
        data = resp.json()
        recordings = data.get("recordings", [])
        if not recordings:
            return {}
        rec = recordings[0]
        tags = [t.get("name", "") for t in rec.get("tags", []) if t.get("name")]
        return {
            "tags": tags,
            "source": "musicbrainz",
        }
    except Exception as exc:  # noqa: BLE001
        log.warning("MusicBrainz lookup error for %r: %s", query, exc)
        return {}


async def _fetch_image_as_data_url(image_url: str, client: httpx.AsyncClient) -> str | None:
    """Download image bytes and return as data:image/...;base64,... string."""
    try:
        resp = await client.get(image_url, timeout=6.0)
        if resp.status_code == 200 and resp.content:
            content_type = resp.headers.get("content-type", "image/jpeg")
            if ";" in content_type:
                content_type = content_type.split(";")[0].strip()
            if not content_type.startswith("image/"):
                content_type = "image/jpeg"
            b64_str = base64.b64encode(resp.content).decode("ascii")
            return f"data:{content_type};base64,{b64_str}"
    except Exception as exc:  # noqa: BLE001
        log.warning("Failed to download cover image %r: %s", image_url, exc)
    return None


async def lookup_song_metadata(query: str) -> dict[str, Any]:
    """Search iTunes, Deezer, and MusicBrainz for track metadata.

    Returns:
      {
        "song_name": str,
        "artist_name": str | None,
        "album": str | None,
        "genre": str | None,
        "cover_url": str | None,
        "cover_data_url": str | None,
        "license_type": "artist_owned" | "royalty_free" | "cc_by",
        "download_allowed": bool,
        "description": str,
        "tags": list[str],
        "sources": list[str],
      }
    """
    clean_query = query.strip()
    if not clean_query:
        return {
            "song_name": "",
            "artist_name": None,
            "album": None,
            "genre": None,
            "cover_url": None,
            "cover_data_url": None,
            "license_type": "artist_owned",
            "download_allowed": False,
            "description": "",
            "tags": [],
            "sources": [],
        }

    async with httpx.AsyncClient(headers=_HEADERS, timeout=_TIMEOUT, follow_redirects=True) as client:
        # Run iTunes and Deezer searches
        itunes = await _search_itunes(clean_query, client)
        deezer = await _search_deezer(clean_query, client)
        mb = await _search_musicbrainz(clean_query, client)

        sources = []
        if itunes:
            sources.append("itunes")
        if deezer:
            sources.append("deezer")
        if mb:
            sources.append("musicbrainz")

        # Pick best artist, album, genre, cover_url
        artist = itunes.get("artist") or deezer.get("artist")
        album = itunes.get("album") or deezer.get("album")
        song_name = itunes.get("title") or deezer.get("title") or clean_query
        genre = itunes.get("genre")

        # Fallback genre from MusicBrainz tags if iTunes didn't give one
        mb_tags = mb.get("tags", [])
        if not genre and mb_tags:
            genre = _clean_genre(mb_tags[0].title())

        # Cover image priority: iTunes 600x600 -> Deezer 500x500
        cover_url = itunes.get("cover_url") or deezer.get("cover_url")

        # Download image into base64 data url for easy client-side conversion to File
        cover_data_url = None
        if cover_url:
            cover_data_url = await _fetch_image_as_data_url(cover_url, client)

        # License inference
        license_type, dl_allowed = _infer_license_type(song_name, artist or "", mb_tags + ([genre] if genre else []))

        # Suggested description
        desc_parts = []
        if artist:
            desc_parts.append(f"Artist: {artist}")
        if album:
            desc_parts.append(f"Album: {album}")
        if genre:
            desc_parts.append(f"Genre: {genre}")
        description = " · ".join(desc_parts)

        return {
            "song_name": song_name,
            "artist_name": artist,
            "album": album,
            "genre": genre,
            "cover_url": cover_url,
            "cover_data_url": cover_data_url,
            "license_type": license_type,
            "download_allowed": dl_allowed,
            "description": description,
            "tags": mb_tags,
            "sources": sources,
        }
