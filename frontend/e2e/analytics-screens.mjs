/**
 * Visual evidence for Analytics (Review Loop #1): an artist with real
 * activity logs in via seeded session, /upload page captured showing the
 * Analytics panel with totals, 7-day activity, and top songs.
 * Run: node e2e/analytics-screens.mjs [frontend-url] [backend-url]
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
  return res.status === 204 ? null : res.json();
}

const boundary = "----anc";
const mp3 = Buffer.concat([Buffer.from("ID3\x04\x00\x00\x00\x00\x00\x00", "latin1"), Buffer.alloc(512)]);
const png = Buffer.concat([Buffer.from("\x89PNG\r\n\x1a\n", "latin1"), Buffer.alloc(4000)]);

const artist = await api("/api/auth/register", {
  data: { email: `an-scr-${SUFFIX}@smoketest.example.com`, username: `an_scr_${SUFFIX}`, password: "password123", is_artist: true },
});
const admin = await api("/api/auth/register", {
  data: { email: "admin-smoke@smoketest.example.com", username: "smoke_admin", password: "password123" },
}).catch(() => api("/api/auth/login", { data: { email: "admin-smoke@smoketest.example.com", password: "password123" } }));
const listener = await api("/api/auth/register", {
  data: { email: `an-scr-l-${SUFFIX}@smoketest.example.com`, username: `an_scr_l_${SUFFIX}`, password: "password123" },
});

const up = await fetch(`${BACKEND}/api/songs`, {
  method: "POST",
  headers: { Authorization: `Bearer ${artist.access_token}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
  body: (() => {
    const p = [];
    p.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nAnalytics Screenshot Song\r\n`, "latin1"));
    p.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="download_allowed"\r\n\r\ntrue\r\n`, "latin1"));
    p.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="license_type"\r\n\r\nartist_owned\r\n`, "latin1"));
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

// real activity: 5 plays, 2 downloads, 1 like
for (let i = 0; i < 5; i++) await api(`/api/songs/${song.id}/play`, { data: {} });
await api(`/api/songs/${song.id}/download`, { token: listener.access_token, data: {} });
await api(`/api/songs/${song.id}/download`, { token: listener.access_token, data: {} });
await api(`/api/songs/${song.id}/like`, { token: listener.access_token, data: {} });

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

await page.goto(`${FRONTEND}/upload`, { waitUntil: "networkidle" });
await page.waitForFunction(() => document.body.innerText.includes("Analytics"), { timeout: 8000 });
await page.waitForFunction(() => document.body.innerText.includes("Total plays"), { timeout: 8000 }).catch(() => {});
await page.screenshot({ path: `${OUT}/analytics-panel.png`, fullPage: true });
console.log(`saved: ${OUT}/analytics-panel.png (upload page with analytics)`);

await browser.close();
console.log("done");
