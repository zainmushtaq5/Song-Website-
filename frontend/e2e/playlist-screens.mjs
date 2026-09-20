/**
 * Visual evidence for Playlists (Review Loop #1): create a playlist via API,
 * add songs, capture the /playlists/[slug] page, then capture the profile
 * "My playlists" section for the owner.
 * Run: node e2e/playlist-screens.mjs [frontend-url] [backend-url]
 */
import { chromium } from "playwright";

const FRONTEND = process.argv[2] ?? "http://localhost:3100";
const BACKEND = process.argv[3] ?? "http://localhost:8000";
const SUFFIX = `${Date.now() % 100000000}`;
const OUT = "e2e/screenshots";

async function api(path, { data = null, token = null, method = null } = {}) {
  const res = await fetch(`${BACKEND}${path}`, {
    method: method ?? (data === null ? "GET" : "POST"),
    headers: {
      ...(data !== null ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data !== null ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.status === 204 ? null : res.json();
}

const boundary = "----scr";
const mp3 = Buffer.concat([Buffer.from("ID3\x04\x00\x00\x00\x00\x00\x00", "latin1"), Buffer.alloc(512)]);
const png = Buffer.concat([Buffer.from("\x89PNG\r\n\x1a\n", "latin1"), Buffer.alloc(2000)]);

function multipart(fields, files) {
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`, "latin1"));
  }
  for (const [name, filename, mime, buf] of files) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`, "latin1"));
    parts.push(buf);
    parts.push(Buffer.from("\r\n", "latin1"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, "latin1"));
  return Buffer.concat(parts);
}

const owner = await api("/api/auth/register", {
  data: { email: `scr-pl-${SUFFIX}@smoketest.example.com`, username: `scr_pl_${SUFFIX}`, password: "password123" },
});
const admin = await api("/api/auth/register", {
  data: { email: "admin-smoke@smoketest.example.com", username: "smoke_admin", password: "password123" },
}).catch(() => api("/api/auth/login", { data: { email: "admin-smoke@smoketest.example.com", password: "password123" } }));

// artist + 2 approved songs
const artist = await api("/api/auth/register", {
  data: { email: `scr-pla-${SUFFIX}@smoketest.example.com`, username: `scr_pl_artist_${SUFFIX}`, password: "password123", is_artist: true },
});
const songIds = [];
const songTitles = [];
for (const title of ["Sunset Drive", "Neon Rain"]) {
  const up = await fetch(`${BACKEND}/api/songs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${artist.access_token}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: multipart({ title }, [["audio", "t.mp3", "audio/mpeg", mp3], ["cover", "c.png", "image/png", png]]),
  });
  if (!up.ok) throw new Error(`upload -> ${up.status}`);
  const song = await up.json();
  await api(`/api/admin/songs/${song.id}/approve`, { token: admin.access_token, data: {} });
  songIds.push(song.id);
  songTitles.push(song.title);
}

const pl = await api("/api/playlists", {
  token: owner.access_token,
  data: { name: `Screens Mix ${SUFFIX}`, description: "Two tracks for the review loop" },
});
for (const sid of songIds) {
  await api(`/api/playlists/${pl.id}/songs`, { token: owner.access_token, data: { song_id: sid } });
}

const session = {
  state: {
    user: { id: (await api("/api/auth/me", { token: owner.access_token })).id, email: `scr-pl-${SUFFIX}@smoketest.example.com`, username: `scr_pl_${SUFFIX}`, role: "USER", avatar_url: null },
    tokens: { access_token: owner.access_token, refresh_token: owner.refresh_token },
  },
  version: 0,
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript((s) => localStorage.setItem("songs-auth", JSON.stringify(s)), session);
const page = await context.newPage();

await page.goto(`${FRONTEND}/playlists/${pl.slug}`, { waitUntil: "networkidle" });
await page.waitForFunction(() => document.body.innerText.includes("Sunset Drive"), { timeout: 8000 }).catch(() => {});
await page.screenshot({ path: `${OUT}/playlist-1-detail.png`, fullPage: true });
console.log(`saved: ${OUT}/playlist-1-detail.png (playlist page with 2 songs)`);

await page.goto(`${FRONTEND}/profile`, { waitUntil: "networkidle" });
await page.waitForFunction(() => document.body.innerText.includes("My playlists"), { timeout: 8000 }).catch(() => {});
await page.screenshot({ path: `${OUT}/playlist-2-profile.png`, fullPage: true });
console.log(`saved: ${OUT}/playlist-2-profile.png (profile My playlists section)`);

await browser.close();
console.log("done");
