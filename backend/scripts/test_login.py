"""Debug login: POST /api/auth/login with exact credentials, then GET /api/auth/me."""
import json
import sys
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"

req = urllib.request.Request(
    f"{BASE}/api/auth/login",
    data=json.dumps({"email": "admin-smoke@smoketest.example.com", "password": "password123"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req) as resp:
        tokens = json.load(resp)
    print(f"login: HTTP {resp.status} — got access token ({len(tokens['access_token'])} chars)")
except urllib.error.HTTPError as e:
    print(f"login: HTTP {e.code} — {e.read().decode()}")
    sys.exit(1)

me_req = urllib.request.Request(
    f"{BASE}/api/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
)
with urllib.request.urlopen(me_req) as resp:
    me = json.load(resp)
print(f"me: HTTP {resp.status} — {me['username']} role={me['role']}")
