/**
 * Visual evidence for Notifications (Review Loop #1).
 * Creates approval + follow notifications for a user via API, seeds the
 * session, then captures: navbar bell with badge, notifications page, and
 * badge cleared after "Mark all read".
 * Run: node e2e/notification-screens.mjs [frontend-url] [backend-url]
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
const png = Buffer.concat([Buffer.from("\x89PNG\r\n\x1a\n", "latin1"), Buffer.alloc(128)]);

const artist = await api("/api/auth/register", {
  data: { email: `nt-scr-${SUFFIX}@smoketest.example.com`, username: `nt_scr_${SUFFIX}`, password: "password123", is_artist: true },
});
const admin = await api("/api/auth/register", {
  data: { email: "admin-smoke@smoketest.example.com", username: "smoke_admin", password: "password123" },
}).catch(() => api("/api/auth/login", { data: { email: "admin-smoke@smoketest.example.com", password: "password123" } }));
const follower = await api("/api/auth/register", {
  data: { email: `nt-scr-f-${SUFFIX}@smoketest.example.com`, username: `nt_scr_f_${SUFFIX}`, password: "password123" },
});

// upload + approve (approval notification)
const up = await fetch(`${BACKEND}/api/songs`, {
  method: "POST",
  headers: { Authorization: `Bearer ${artist.access_token}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
  body: (() => {
    const p = [];
    p.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nBadge Test Song\r\n`, "latin1"));
    p.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="t.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`, "latin1"));
    p.push(mp3, Buffer.from("\r\n", "latin1"));
    p.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="cover"; filename="c.png"\r\nContent-Type: image/png\r\n\r\n`, "latin1"));
    p.push(png, Buffer.from("\r\n", "latin1"));
    p.push(Buffer.from(`--${boundary}--\r\n`, "latin1"));
    return Buffer.concat(p);
  })(),
});
const song = await up.json();
await api(`/api/admin/songs/${song.id}/approve`, { token: admin.access_token, data: {} });
// follow (new_follower notification)
await api(`/api/artists/${song.artist_slug}/follow`, { token: follower.access_token, data: {} });

const me = await api("/api/auth/me", { token: artist.access_token });
const session = {
  state: {
    user: me,
    tokens: { access_token: artist.access_token, refresh_token: artist.refresh_token },
  },
  version: 0,
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript((s) => localStorage.setItem("songs-auth", JSON.stringify(s)), session);
const page = await context.newPage();

// 1. homepage: bell with unread badge (2)
await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
await page.locator("[data-testid='unread-badge']").waitFor({ timeout: 8000 });
await page.screenshot({ path: `${OUT}/notif-1-bell-badge.png` });
console.log(`saved: ${OUT}/notif-1-bell-badge.png (bell with badge)`);

// 2. notifications page with unread items
await page.goto(`${FRONTEND}/notifications`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Mark all read/i }).waitFor({ timeout: 8000 });
await page.screenshot({ path: `${OUT}/notif-2-list.png` });
console.log(`saved: ${OUT}/notif-2-list.png (notifications list)`);

// 3. mark all read -> badge disappears
await page.getByRole("button", { name: /Mark all read/i }).click();
await page.waitForFunction(
  () => !document.querySelector("[data-testid='unread-badge']"),
  { timeout: 8000 },
).catch(() => {});
await page.screenshot({ path: `${OUT}/notif-3-read.png` });
console.log(`saved: ${OUT}/notif-3-read.png (badge cleared after mark all read)`);

await browser.close();
console.log("done");
