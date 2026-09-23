/**
 * Visual evidence for Analytics Phase 3 (7/30/90-day charts + per-song drilldown):
 * an artist with real activity logs in via seeded session, /upload page captured
 * showing the Analytics panel with charts, then window toggles, then a per-song
 * drilldown page. Screenshots named analytics3-*.png.
 * Run: node e2e/analytics3-screens.mjs [frontend-url] [backend-url]
 */
import { chromium } from "playwright";

const FRONTEND = process.argv[2] ?? "http://localhost:3001";
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
  return res.status === 204 ? null : res.json();
}

const boundary = "----anc";
const mp3 = Buffer.concat([Buffer.from("ID3\x04\x00\x00\x00\x00\x00\x00", "latin1"), Buffer.alloc(512)]);
const png = Buffer.concat([Buffer.from("\x89PNG\r\n\x1a\n", "latin1"), Buffer.alloc(4000)]);

const artist = await api("/api/auth/register", {
  data: { email: `a3-scr-${SUFFIX}@smoketest.example.com`, username: `a3_scr_${SUFFIX}`, password: "password123", is_artist: true },
});
const admin = await api("/api/auth/register", {
  data: { email: "admin-smoke@smoketest.example.com", username: "smoke_admin", password: "password123" },
}).catch(() => api("/api/auth/login", { data: { email: "admin-smoke@smoketest.example.com", password: "password123" } }));
const listener = await api("/api/auth/register", {
  data: { email: `a3-scr-l-${SUFFIX}@smoketest.example.com`, username: `a3_scr_l_${SUFFIX}`, password: "password123" },
});

async function uploadSong(title, dl) {
  const res = await fetch(`${BACKEND}/api/songs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${artist.access_token}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: (() => {
      const p = [];
      p.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\n${title}\r\n`, "latin1"));
      if (dl) {
        p.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="download_allowed"\r\n\r\ntrue\r\n`, "latin1"));
        p.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="license_type"\r\n\r\nartist_owned\r\n`, "latin1"));
      }
      p.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="t.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`, "latin1"));
      p.push(mp3, Buffer.from("\r\n", "latin1"));
      p.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="cover"; filename="c.png"\r\nContent-Type: image/png\r\n\r\n`, "latin1"));
      p.push(png, Buffer.from("\r\n", "latin1"));
      p.push(Buffer.from(`--${boundary}--\r\n`, "latin1"));
      return Buffer.concat(p);
    })(),
  });
  const song = await res.json();
  await api(`/api/admin/songs/${song.id}/approve`, { token: admin.access_token, data: {} });
  return song;
}

const hit = await uploadSong("Phase3 Chart Hit", true);
const quiet = await uploadSong("Phase3 Quiet Track", false);

// real activity: 8 plays on hit, 2 on quiet, downloads + likes
for (let i = 0; i < 8; i++) await api(`/api/songs/${hit.id}/play`, { data: {} });
for (let i = 0; i < 2; i++) await api(`/api/songs/${quiet.id}/play`, { data: {} });
for (let i = 0; i < 2; i++) await api(`/api/songs/${hit.id}/download`, { token: listener.access_token, data: {} });
await api(`/api/songs/${hit.id}/like`, { token: listener.access_token, data: {} });
await api(`/api/songs/${quiet.id}/like`, { token: listener.access_token, data: {} });

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

// 1) full analytics panel with charts (default 30d)
await page.goto(`${FRONTEND}/upload`, { waitUntil: "networkidle" });
await page.waitForFunction(() => document.body.innerText.includes("Per Day"), { timeout: 15000 });
await page.screenshot({ path: `${OUT}/analytics3-panel-30d.png`, fullPage: true });
console.log("saved: analytics3-panel-30d.png");

// 2) toggle 90d window and capture
await page.getByRole("tab", { name: "90d" }).click();
await page.waitForFunction(() => document.body.innerText.includes("90 days"), { timeout: 15000 });
await page.screenshot({ path: `${OUT}/analytics3-panel-90d.png`, fullPage: true });
console.log("saved: analytics3-panel-90d.png");

// 3) per-song drilldown
await page.getByRole("button", { name: /Drill down/i }).first().click();
await page.waitForFunction(() => document.body.innerText.includes("Drilldown for"), { timeout: 15000 });
await page.waitForFunction(() => document.body.innerText.includes("Per Day"), { timeout: 15000 });
await page.screenshot({ path: `${OUT}/analytics3-drilldown.png`, fullPage: true });
console.log("saved: analytics3-drilldown.png");

await browser.close();
console.log("done");