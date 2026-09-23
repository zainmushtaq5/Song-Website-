"""License workflow tests: initial PENDING, download gating, admin actions,
artist edit resets review, expiry, RBAC."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from tests.conftest import MP3_BYTES, PNG_BYTES


def _upload(client, auth_headers, title="License Song", download_allowed=True):
    files = {"audio": ("track.mp3", MP3_BYTES, "audio/mpeg"), "cover": ("cover.png", PNG_BYTES, "image/png")}
    data = {"title": title}
    if download_allowed:
        data.update({"download_allowed": "true", "license_type": "artist_owned"})
    r = client.post("/api/songs", data=data, files=files, headers=auth_headers)
    assert r.status_code == 201, r.text
    return r.json()


def _pending_license(client, admin_headers, song_id):
    lics = client.get("/api/admin/licenses", headers=admin_headers).json()
    return next(l for l in lics if l["song_id"] == song_id)


def _approve_license(client, admin_headers, lic_id, json=None):
    return client.post(f"/api/admin/licenses/{lic_id}/approve", headers=admin_headers, json=json or {})


def test_upload_creates_pending_license_and_blocks_download(
    client, auth_headers, admin_headers, user_headers
) -> None:
    song = _upload(client, auth_headers)
    assert song["license_status"] == "PENDING"

    # song approved but license still pending -> download blocked
    client.post(f"/api/admin/songs/{song['id']}/approve", headers=admin_headers)
    r = client.post(f"/api/songs/{song['id']}/download", headers=user_headers)
    assert r.status_code == 403

    lic = _pending_license(client, admin_headers, song["id"])
    assert lic["license_type"] == "artist_owned"
    assert lic["status"] == "PENDING"


def test_admin_approve_enables_download_and_reject_disables(
    client, auth_headers, admin_headers, user_headers
) -> None:
    song = _upload(client, auth_headers)
    client.post(f"/api/admin/songs/{song['id']}/approve", headers=admin_headers)
    lic = _pending_license(client, admin_headers, song["id"])

    r = _approve_license(client, admin_headers, lic["id"], {"note": "proof checked"})
    assert r.status_code == 200 and r.json()["status"] == "APPROVED"
    assert client.post(f"/api/songs/{song['id']}/download", headers=user_headers).status_code == 200

    # double approve -> 409
    assert _approve_license(client, admin_headers, lic["id"]).status_code == 409

    # reject afterwards -> downloads blocked again
    r = client.post(
        f"/api/admin/licenses/{lic['id']}/reject", headers=admin_headers, json={"reason": "proof invalid"}
    )
    assert r.status_code == 200 and r.json()["status"] == "REJECTED"
    assert r.json()["action_reason"] == "proof invalid"
    r = client.post(f"/api/songs/{song['id']}/download", headers=user_headers)
    assert r.status_code == 403


def test_suspend_and_reinstate(client, auth_headers, admin_headers, user_headers) -> None:
    song = _upload(client, auth_headers)
    client.post(f"/api/admin/songs/{song['id']}/approve", headers=admin_headers)
    lic = _pending_license(client, admin_headers, song["id"])
    assert _approve_license(client, admin_headers, lic["id"]).status_code == 200
    assert client.post(f"/api/songs/{song['id']}/download", headers=user_headers).status_code == 200

    r = client.post(
        f"/api/admin/licenses/{lic['id']}/suspend",
        headers=admin_headers,
        json={"reason": "dispute received"},
    )
    assert r.status_code == 200 and r.json()["status"] == "SUSPENDED"
    assert client.post(f"/api/songs/{song['id']}/download", headers=user_headers).status_code == 403

    # reinstate from suspended -> downloads work again
    r = client.post(f"/api/admin/licenses/{lic['id']}/reinstate", headers=admin_headers)
    assert r.status_code == 200 and r.json()["status"] == "APPROVED"
    assert client.post(f"/api/songs/{song['id']}/download", headers=user_headers).status_code == 200


def test_expired_license_blocks_download(client, auth_headers, admin_headers, user_headers) -> None:
    song = _upload(client, auth_headers)
    client.post(f"/api/admin/songs/{song['id']}/approve", headers=admin_headers)
    lic = _pending_license(client, admin_headers, song["id"])

    r = _approve_license(client, admin_headers, lic["id"], {"note": "proof checked"})
    assert r.status_code == 200
    assert client.post(f"/api/songs/{song['id']}/download", headers=user_headers).status_code == 200

    # artist sets a past effective_until via edit; review resets to PENDING
    past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    r = client.put(
        f"/api/songs/{song['id']}/license",
        headers=auth_headers,
        json={
            "license_type": "artist_owned",
            "rights_holder": "Test Artist",
            "effective_from": "2025-01-01T00:00:00Z",
            "effective_until": past,
        },
    )
    assert r.status_code == 200 and r.json()["status"] == "PENDING"

    lic2 = _pending_license(client, admin_headers, song["id"])
    assert _approve_license(client, admin_headers, lic2["id"]).status_code == 200

    # APPROVED but past effective_until -> effective status EXPIRED, download blocked
    body = client.get(f"/api/songs/{song['id']}", headers=auth_headers).json()
    assert body["license_status"] == "EXPIRED"
    r = client.post(f"/api/songs/{song['id']}/download", headers=user_headers)
    assert r.status_code == 403

    # already-APPROVED (even though effectively expired) -> 409; the artist
    # revives it by editing the license with new dates (resets to PENDING)
    assert client.post(f"/api/admin/licenses/{lic2['id']}/reinstate", headers=admin_headers).status_code == 409


def test_artist_edit_resets_review_and_rbac(client, auth_headers, admin_headers, user_headers) -> None:
    song = _upload(client, auth_headers)
    lic = _pending_license(client, admin_headers, song["id"])
    assert _approve_license(client, admin_headers, lic["id"]).status_code == 200

    # artist edits rights info -> back to PENDING
    r = client.put(
        f"/api/songs/{song['id']}/license",
        headers=auth_headers,
        json={
            "license_type": "cc_by",
            "rights_holder": "Test Artist",
            "proof_reference": "https://example.com/proof",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "PENDING"
    assert body["license_type"] == "cc_by"
    assert body["rights_holder"] == "Test Artist"
    assert body["reviewed_at"] is None

    # non-owner cannot read or edit
    assert client.get(f"/api/songs/{song['id']}/license", headers=user_headers).status_code == 403
    r = client.put(
        f"/api/songs/{song['id']}/license",
        headers=user_headers,
        json={"license_type": "cc_by", "rights_holder": "Someone Else"},
    )
    assert r.status_code == 403

    # unknown song
    assert client.get(f"/api/songs/{uuid4()}/license", headers=auth_headers).status_code == 404

    # invalid license_type / missing proof for 'other'
    r = client.put(
        f"/api/songs/{song['id']}/license",
        headers=auth_headers,
        json={"license_type": "bogus", "rights_holder": "X"},
    )
    assert r.status_code == 422
    r = client.put(
        f"/api/songs/{song['id']}/license",
        headers=auth_headers,
        json={"license_type": "other", "rights_holder": "X"},
    )
    assert r.status_code == 422


def test_admin_endpoints_rbac_and_listing(client, auth_headers, admin_headers, user_headers) -> None:
    song = _upload(client, auth_headers)
    assert client.get("/api/admin/licenses", headers=user_headers).status_code == 403
    assert client.get("/api/admin/licenses", headers=auth_headers).status_code == 403

    lic = _pending_license(client, admin_headers, song["id"])
    assert client.get("/api/admin/licenses?review_status=BOGUS", headers=admin_headers).status_code == 422
    assert client.post(f"/api/admin/licenses/{lic['id']}/reject", headers=admin_headers, json={}).status_code == 422
    assert client.post(f"/api/admin/licenses/{lic['id']}/approve", headers=auth_headers, json={}).status_code == 403
    assert client.post(f"/api/admin/licenses/{uuid4()}/approve", headers=admin_headers, json={}).status_code == 404
    assert client.post(f"/api/admin/licenses/{lic['id']}/reinstate", headers=admin_headers).status_code == 409


def test_license_actions_send_notifications(client, auth_headers, admin_headers) -> None:
    song = _upload(client, auth_headers)
    lic = _pending_license(client, admin_headers, song["id"])
    client.post(f"/api/admin/licenses/{lic['id']}/reject", headers=admin_headers, json={"reason": "no proof"})
    notes = client.get("/api/notifications", headers=auth_headers).json()["notifications"]
    assert any(n["type"] == "license_rejected" for n in notes), notes