/**
 * Visual evidence for Phase 3 licenses: artist upload page with license chip +
 * rights editor, admin License review tab, approved state.
 * Run: node e2e/license3-screens.mjs [frontend-url] [backend-url]
 */
import { chromium } from "playwright";

const FRONTEND = process.argv[2] ?? "http://localhost:3001";
const BACKEND = process.argv[3] ?? "http://localhost:8000";
const SUFFIX = `${Date.now() % 100000000}`;
const OUT = "e2e/screenshots";

async function api(path, { data = null, token = null, method = null } = {}) {
  const res = await fetch(`${BACKEND}${path}`, {
    method: method || (data === null ? "GET" : "POST"),
    headers: {
      ...(data !== null ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data !== null ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

const boundary = "----anc";
const mp3 = Buffer.concat([Buffer.from("ID3\x04\x00\x00\x00\x00\x00\x00", "latin1"), Buffer.alloc(512)]);
const png = Buffer.concat([Buffer.from("\x89PNG\r\n\x1a\n", "latin1"), Buffer.alloc(4000)]);

const artist = await api("/api/auth/register", {
  data: { email: `lic-scr-${SUFFIX}@smoketest.example.com`, username: `lic_scr_${SUFFIX}`, password: "password123", is_artist: true },
});
const admin = await api("/api/auth/register", {
  data: { email: "admin-smoke@smoketest.example.com", username: "smoke_admin", password: "password123" },
}).catch(() => api("/api/auth/login", { data: { email: "admin-smoke@smoketest.example.com", password: "password123" } }));

const up = await fetch(`${BACKEND}/api/songs`, {
  method: "POST",
  headers: { Authorization: `Bearer ${artist.access_token}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
  body: (() => {
    const p = [];
    p.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nRights Workflow Song\r\n`, "latin1"));
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

function sessionFor(token, user) {
  return { state: { user, tokens: { access_token: token, refresh_token: token } }, version: 0 };
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

// --- 1) artist view: license chip PENDING + rights editor
const artistCtx = context;
await artistCtx.addInitScript((s) => localStorage.setItem("songs-auth", JSON.stringify(s)), sessionFor(artist.access_token, await api("/api/auth/me", { token: artist.access_token })));
const page = await artistCtx.newPage();
await page.goto(`${FRONTEND}/upload`, { waitUntil: "networkidle" });
await page.waitForFunction(() => document.body.innerText.includes("License: PENDING"), { timeout: 15000 });
await page.screenshot({ path: `${OUT}/license3-artist-pending.png`, fullPage: true });
console.log("saved: license3-artist-pending.png");

await page.getByRole("button", { name: "License & rights" }).click();
await page.waitForFunction(() => document.body.innerText.includes("Rights holder"), { timeout: 15000 });
await page.screenshot({ path: `${OUT}/license3-artist-editor.png`, fullPage: true });
console.log("saved: license3-artist-editor.png");
await page.close();

// --- 2) admin view: license review tab
const adminPage = await context.newPage();
await adminPage.addInitScript((s) => localStorage.setItem("songs-auth", JSON.stringify(s)), sessionFor(admin.access_token, await api("/api/auth/me", { token: admin.access_token })));
await adminPage.goto(`${FRONTEND}/admin`, { waitUntil: "networkidle" });
await adminPage.waitForFunction(() => document.body.innerText.includes("License review"), { timeout: 15000 });
await adminPage.getByRole("tab", { name: /License review/i }).click();
await adminPage.waitForFunction(() => document.body.innerText.includes("Rights Workflow Song"), { timeout: 15000 });
await adminPage.screenshot({ path: `${OUT}/license3-admin-queue.png`, fullPage: true });
console.log("saved: license3-admin-queue.png");
await adminPage.close();

// --- 3) approve license, artist view shows APPROVED
const lics = await api("/api/admin/licenses", { token: admin.access_token });
const lic = lics.find((l) => l.song_id === song.id);
await api(`/api/admin/licenses/${lic.id}/approve`, { token: admin.access_token, data: { note: "proof verified" } });

const page3 = await context.newPage();
await page3.addInitScript((s) => localStorage.setItem("songs-auth", JSON.stringify(s)), sessionFor(artist.access_token, await api("/api/auth/me", { token: artist.access_token })));
await page3.goto(`${FRONTEND}/upload`, { waitUntil: "networkidle" });
await page3.waitForFunction(() => document.body.innerText.includes("License: APPROVED"), { timeout: 15000 });
await page3.screenshot({ path: `${OUT}/license3-artist-approved.png`, fullPage: true });
console.log("saved: license3-artist-approved.png");

await browser.close();
console.log("done");