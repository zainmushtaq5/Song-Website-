/**
 * Visual evidence for the Follows feature (Review Loop #1: show, don't tell).
 * Seeds a listener session, then captures:
 *   1. artist page with Follow button + 0 followers
 *   2. after clicking Follow: "Following" button + 1 follower
 *   3. profile page with the artist in the Following list
 * Run: node e2e/follow-screens.mjs [frontend-url] [backend-url]
 */
import { chromium } from "playwright";

const FRONTEND = process.argv[2] ?? "http://localhost:3100";
const BACKEND = process.argv[3] ?? "http://localhost:8000";
const SUFFIX = `${Date.now() % 100000000}`;
const OUT = "e2e/screenshots";

async function api(path, { data = null, token = null } = {}) {
  const res = await fetch(`${BACKEND}${path}`, {
    method: data === null ? "GET" : "POST",
    headers: {
      ...(data !== null ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data !== null ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

const boundary = "----scr";
const mp3 = Buffer.concat([Buffer.from("ID3\x04\x00\x00\x00\x00\x00\x00", "latin1"), Buffer.alloc(512)]);
const png = Buffer.concat([Buffer.from("\x89PNG\r\n\x1a\n", "latin1"), Buffer.alloc(128)]);

const artist = await api("/api/auth/register", {
  data: { email: `scr-artist-${SUFFIX}@smoketest.example.com`, username: `screen_artist_${SUFFIX}`, password: "password123", is_artist: true },
});
const admin = await api("/api/auth/register", {
  data: { email: "admin-smoke@smoketest.example.com", username: "smoke_admin", password: "password123" },
}).catch(() => api("/api/auth/login", { data: { email: "admin-smoke@smoketest.example.com", password: "password123" } }));
const listener = await api("/api/auth/register", {
  data: { email: `scr-listener-${SUFFIX}@smoketest.example.com`, username: `screen_user_${SUFFIX}`, password: "password123" },
});

const upRes = await fetch(`${BACKEND}/api/songs`, {
  method: "POST",
  headers: { Authorization: `Bearer ${artist.access_token}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
  body: (() => {
    const p = [];
    p.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nScreenshot Song\r\n`, "latin1"));
    p.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="t.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`, "latin1"));
    p.push(mp3, Buffer.from("\r\n", "latin1"));
    p.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="cover"; filename="c.png"\r\nContent-Type: image/png\r\n\r\n`, "latin1"));
    p.push(png, Buffer.from("\r\n", "latin1"));
    p.push(Buffer.from(`--${boundary}--\r\n`, "latin1"));
    return Buffer.concat(p);
  })(),
});
const song = await upRes.json();
await api(`/api/admin/songs/${song.id}/approve`, { token: admin.access_token, data: {} });

// Listener session injected into localStorage (zustand persist shape)
const session = {
  state: {
    user: { id: song.artist_id === "x" ? null : (await api("/api/auth/me", { token: listener.access_token })).id, email: `scr-listener-${SUFFIX}@smoketest.example.com`, username: `screen_user_${SUFFIX}`, role: "USER", avatar_url: null },
    tokens: { access_token: listener.access_token, refresh_token: listener.refresh_token },
  },
  version: 0,
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript((s) => localStorage.setItem("songs-auth", JSON.stringify(s)), session);
const page = await context.newPage();

await page.goto(`${FRONTEND}/artists/${song.artist_slug}`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Follow artist" }).waitFor({ timeout: 5000 });
await page.screenshot({ path: `${OUT}/follow-1-before.png`, fullPage: false });
console.log(`saved: ${OUT}/follow-1-before.png (Follow button + 0 followers)`);

await page.getByRole("button", { name: "Follow artist" }).click();
await page.getByRole("button", { name: "Unfollow artist" }).waitFor({ timeout: 5000 });
await page.waitForFunction(() => /[1-9]\d*\s*follower/.test(document.body.innerText), { timeout: 5000 }).catch(() => {});
await page.screenshot({ path: `${OUT}/follow-2-following.png`, fullPage: false });
console.log(`saved: ${OUT}/follow-2-following.png (Following button + 1 follower)`);

await page.goto(`${FRONTEND}/profile`, { waitUntil: "networkidle" });
await page.getByText("Following").first().waitFor({ timeout: 5000 });
await page.screenshot({ path: `${OUT}/follow-3-profile.png`, fullPage: true });
console.log(`saved: ${OUT}/follow-3-profile.png (profile Following list)`);

await browser.close();
console.log("done");
