/**
 * E2E: signed-media URL resolution.
 * Uploads a song with genuinely decodable media (a real PNG cover and a real PCM
 * WAV tone), approves it as the admin, then loads its detail page in a real browser
 * and verifies:
 *  1. The cover <img> src points at the BACKEND origin (:8000), not the frontend.
 *  2. The image actually loads (naturalWidth > 0 => HTTP 200 from /media).
 *  3. Clicking play sets the <audio> src to the backend origin.
 *  4. The audio stream actually decodes (readyState > 0, no MediaError).
 *  5. No /media request is ever made to the frontend origin; all /media requests
 *     to the backend return 200/206.
 *
 * The suite creates its own fixture on purpose: other suites upload placeholder
 * bytes that no decoder accepts, and the newest feed song is not guaranteed to be
 * playable. Media the browser rejects proves nothing about URL signing.
 *
 * Run: node e2e/media-test.mjs [frontend-url] [backend-url]
 */
import zlib from "node:zlib";

import { chromium } from "playwright";

const FRONTEND = process.argv[2] ?? "http://localhost:3000";
const BACKEND = process.argv[3] ?? "http://localhost:8000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin-smoke@smoketest.example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "password123";
const STAMP = String(Date.now()).slice(-6);

// ── fixture: an approved song whose media the browser can really decode ───────
const admin = await request("/api/auth/login", {
  method: "POST",
  body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
});
if (admin.status !== 200) {
  console.log(`FAIL: admin login -> ${admin.status} ${admin.text.slice(0, 120)}`);
  process.exit(1);
}

const artist = await request("/api/auth/register", {
  method: "POST",
  body: {
    email: `media-fixture-${STAMP}@smoketest.example.com`,
    username: `mediafix_${STAMP}`,
    password: "password123",
    is_artist: true,
  },
});
if (artist.status !== 201) {
  console.log(`FAIL: artist register -> ${artist.status} ${artist.text.slice(0, 120)}`);
  process.exit(1);
}

const form = new FormData();
form.append("title", `Media Fixture ${STAMP}`);
form.append("description", "decodable media fixture for the signed-URL suite");
form.append("genre", "Ambient");
form.append("download_allowed", "false");
form.append("audio", new Blob([toneWav()], { type: "audio/wav" }), "tone.wav");
form.append("cover", new Blob([pngCover()], { type: "image/png" }), "cover.png");
const uploaded = await request("/api/songs", {
  token: artist.json.access_token,
  method: "POST",
  form,
});
if (uploaded.status !== 201) {
  console.log(`FAIL: upload -> ${uploaded.status} ${uploaded.text.slice(0, 160)}`);
  process.exit(1);
}
const approved = await request(`/api/admin/songs/${uploaded.json.id}/approve`, {
  token: admin.json.access_token,
  method: "POST",
});
if (approved.status !== 200) {
  console.log(`FAIL: approve -> ${approved.status} ${approved.text.slice(0, 160)}`);
  process.exit(1);
}

const slug = uploaded.json.slug;
if (!slug) {
  console.log("FAIL: the fixture came back without a slug");
  process.exit(1);
}
console.log(`Testing song page: ${FRONTEND}/song/${slug}`);


/** A real, decodable PNG (truecolour, deflate-compressed scanlines). */
function pngCover(size = 96) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    for (let x = 0; x < size; x++) {
      raw[row + 1 + x * 3] = 0x8b;
      raw[row + 1 + x * 3 + 1] = 0x5c;
      raw[row + 1 + x * 3 + 2] = 0xf6;
    }
  }
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "latin1");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "latin1"), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A real mono WAV tone that Chromium can decode and stream. */
function toneWav({ seconds = 4, freq = 320, rate = 8000 } = {}) {
  const frames = Buffer.alloc(seconds * rate * 2);
  for (let i = 0; i < seconds * rate; i++) {
    frames.writeInt16LE(Math.round(12000 * Math.sin((2 * Math.PI * freq * i) / rate)), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(36 + frames.length, 4);
  header.write("WAVE", 8, "latin1");
  header.write("fmt ", 12, "latin1");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "latin1");
  header.writeUInt32LE(frames.length, 40);
  return Buffer.concat([header, frames]);
}

async function request(path, { token, method = "GET", body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const resp = await fetch(`${BACKEND}${path}`, { method, headers, body: payload });
  const text = await resp.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  return { status: resp.status, json, text };
}


const results = [];
function check(label, cond, extra = "") {
  results.push({ label, pass: cond });
  console.log(`[${cond ? "PASS" : "FAIL"}] ${label}${cond ? "" : ` -> ${extra}`}`);
}

const mediaRequests = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("response", (resp) => {
  const url = new URL(resp.url());
  if (url.pathname.startsWith("/media/")) {
    mediaRequests.push({ origin: url.origin, status: resp.status() });
  }
});

await page.goto(`${FRONTEND}/song/${slug}`, { waitUntil: "networkidle" });

// 1 + 2: cover img src origin + actual load
const img = page.locator("img").first();
const imgSrc = await img.getAttribute("src");
check(
  "cover src points at backend origin",
  !!imgSrc && imgSrc.startsWith(`${BACKEND}/media/`),
  imgSrc ?? "null",
);
await img.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
const loaded = await img.evaluate((el) => el.complete && el.naturalWidth > 0);
check("cover image actually loaded (naturalWidth > 0)", loaded);

// 3: click play -> <audio> src
await page.getByRole("button", { name: "Play", exact: true }).first().click();
const audioSrc = await page
  .waitForFunction(
    () => {
      const a = document.querySelector("audio");
      return a && a.src.startsWith("http") ? a.src : null;
    },
    { timeout: 5000 },
  )
  .then((h) => h.jsonValue())
  .catch(() => null);
check(
  "audio src points at backend origin",
  !!audioSrc && audioSrc.startsWith(`${BACKEND}/media/`),
  audioSrc ?? "no audio element",
);

// Give the audio element a moment to fetch the stream, then check it loaded
await page.waitForTimeout(1500);
const audioState = await page.evaluate(() => {
  const a = document.querySelector("audio");
  if (!a) return null;
  return { readyState: a.readyState, networkState: a.networkState, error: a.error?.code ?? null };
});
check(
  "audio stream loads (readyState > 0, no error)",
  !!audioState && audioState.readyState > 0 && audioState.error === null,
  JSON.stringify(audioState),
);

// 4: all /media requests went to the backend and succeeded
const wrongOrigin = mediaRequests.filter((m) => m.origin !== BACKEND);
check("no /media requests to frontend origin", wrongOrigin.length === 0, JSON.stringify(wrongOrigin));
const badStatus = mediaRequests.filter(
  (m) => m.origin === BACKEND && m.status !== 200 && m.status !== 206,
);
check(
  "all backend /media responses are 200/206 (206 = audio Range streaming)",
  badStatus.length === 0,
  JSON.stringify(badStatus),
);
check("at least two /media requests observed (cover + audio)", mediaRequests.length >= 2, `${mediaRequests.length}`);

console.log("\nMedia requests observed:");
for (const m of mediaRequests) console.log(`  ${m.origin} -> ${m.status}`);

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\nE2E RESULT: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
