/**
 * Visual evidence for Phase 3.4 background jobs: admin Jobs tab showing the
 * worker queue with a DONE probe_upload job.
 * Run: node e2e/jobs4-screens.mjs [frontend-url] [backend-url]
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
  return res.json();
}

const admin = await api("/api/auth/register", {
  data: { email: "admin-smoke@smoketest.example.com", username: "smoke_admin", password: "password123" },
}).catch(() => api("/api/auth/login", { data: { email: "admin-smoke@smoketest.example.com", password: "password123" } }));

// ensure at least one job exists: register a fresh artist so a probe job lands in the queue
const artist = await api("/api/auth/register", {
  data: { email: `job-scr-${SUFFIX}@smoketest.example.com`, username: `job_scr_${SUFFIX}`, password: "password123", is_artist: true },
});
const boundary = "----anc";
const mp3 = Buffer.concat([Buffer.from("ID3\x04\x00\x00\x00\x00\x00\x00", "latin1"), Buffer.alloc(512)]);
const png = Buffer.concat([Buffer.from("\x89PNG\r\n\x1a\n", "latin1"), Buffer.alloc(4000)]);
await fetch(`${BACKEND}/api/songs`, {
  method: "POST",
  headers: { Authorization: `Bearer ${artist.access_token}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
  body: (() => {
    const p = [];
    p.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nJobs Screenshot Song\r\n`, "latin1"));
    p.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="t.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`, "latin1"));
    p.push(mp3, Buffer.from("\r\n", "latin1"));
    p.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="cover"; filename="c.png"\r\nContent-Type: image/png\r\n\r\n`, "latin1"));
    p.push(png, Buffer.from("\r\n", "latin1"));
    p.push(Buffer.from(`--${boundary}--\r\n`, "latin1"));
    return Buffer.concat(p);
  })(),
});
// wait for the worker to finish it
for (let i = 0; i < 20; i++) {
  const jobs = await api("/api/admin/jobs", { token: admin.access_token });
  const probe = jobs.find((j) => j.type === "probe_upload" && j.payload.song_id && j.status === "DONE");
  if (probe) break;
  await new Promise((r) => setTimeout(r, 1500));
}

const me = await api("/api/auth/me", { token: admin.access_token });
const session = { state: { user: me, tokens: { access_token: admin.access_token, refresh_token: admin.refresh_token } }, version: 0 };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript((s) => localStorage.setItem("songs-auth", JSON.stringify(s)), session);
const page = await context.newPage();
await page.goto(`${FRONTEND}/admin`, { waitUntil: "networkidle" });
await page.waitForFunction(() => document.body.innerText.includes("Jobs"), { timeout: 15000 });
await page.getByRole("tab", { name: /Jobs/i }).click();
await page.waitForFunction(() => document.body.innerText.includes("probe_upload"), { timeout: 15000 });
await page.screenshot({ path: `${OUT}/jobs4-admin-queue.png`, fullPage: true });
console.log("saved: jobs4-admin-queue.png");

await browser.close();
console.log("done");