/**
 * Live proof for direct admin song management: the Songs tab of /admin is a
 * management surface where an admin can edit any song (metadata, license fields,
 * cover, audio) and soft-delete it, separately from the artist request queue.
 *
 * Run: node e2e/admin-songs-screens.mjs [frontend-url] [backend-url]
 *
 * What it proves, in order:
 *   1. admin login, queue badge, status filters (Pending/Approved/All)
 *   2. an edit through the UI changes title/description/genre/license on the server
 *   3. replacing the audio re-queues the probe job, and the worker refills
 *      duration/bitrate/sample_rate from the new file
 *   4. replacing the cover swaps the stored object (thumbnail changes)
 *   5. delete soft-deletes: gone from the admin list, the feed, search and its URL
 *   6. artists and listeners cannot edit or delete (403), anonymous callers 401 (via API)
 *      and an artist sees "Not authorized" on /admin (via UI)
 */
import fs from "node:fs";
import zlib from "node:zlib";

import { chromium } from "playwright";

const FRONTEND = process.argv[2] ?? "http://localhost:3000";
const BACKEND = process.argv[3] ?? "http://localhost:8000";
const OUT = "e2e/screenshots";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin-smoke@smoketest.example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "password123";
const ARTIST_PASSWORD = "password123";
const STAMP = String(Date.now()).slice(-6);

let passed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`[PASS] ${name}`);
  } else {
    failures.push(name);
    console.log(`[FAIL] ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

function log(label, value) {
  console.log(`${label}: ${JSON.stringify(value)}`);
}

function shot(page, name) {
  return page.screenshot({ path: `${OUT}/${name}.png` }).then(() => console.log(`saved: ${name}.png`));
}

async function api(path, { token, method = "GET", body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
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

/** A real, decodable PNG (truecolour, deflate-compressed scanlines). */
function pngCover(size = 96, rgb = [0x8b, 0x5c, 0xf6]) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    const shade = 1 - 0.55 * (y / (size - 1));
    for (let x = 0; x < size; x++) {
      for (let c = 0; c < 3; c++) raw[row + 1 + x * 3 + c] = Math.round(rgb[c] * shade);
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

/** A real mono WAV tone, so the probe has genuine metadata to measure. */
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

fs.mkdirSync(OUT, { recursive: true });

// ── 0. fixtures: an admin session, an artist with two approved songs, one pending
const login = await api("/api/auth/login", {
  method: "POST",
  body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
});
check(
  "admin account can log in",
  login.status === 200 && Boolean(login.json?.access_token),
  `${login.status} ${login.text.slice(0, 140)}`,
);
const adminToken = login.json?.access_token;

const registered = await api("/api/auth/register", {
  method: "POST",
  body: {
    email: `admin-songs-${STAMP}@smoketest.example.com`,
    username: `adminsongs_${STAMP}`,
    password: ARTIST_PASSWORD,
    is_artist: true,
  },
});
check("artist account created for the fixtures", registered.status === 201, `${registered.status}`);
const artistToken = registered.json?.access_token;

const listenerReg = await api("/api/auth/register", {
  method: "POST",
  body: {
    email: `admin-songs-listener-${STAMP}@smoketest.example.com`,
    username: `adminsongs_l_${STAMP}`,
    password: ARTIST_PASSWORD,
  },
});
const listenerToken = listenerReg.json?.access_token;

async function upload(title, freq) {
  const form = new FormData();
  form.append("title", title);
  form.append("description", `${title} original description`);
  form.append("genre", "Synthwave");
  form.append("download_allowed", "true");
  form.append("license_type", "artist_owned");
  form.append("rights_note", "I own this recording");
  form.append("audio", new Blob([toneWav({ freq })], { type: "audio/wav" }), "tone.wav");
  form.append("cover", new Blob([pngCover(96)], { type: "image/png" }), "cover.png");
  const resp = await api("/api/songs", { token: artistToken, method: "POST", form });
  if (resp.status !== 201) throw new Error(`upload failed: ${resp.status} ${resp.text.slice(0, 200)}`);
  return resp.json;
}

const editable = await upload(`Admin Edit Target ${STAMP}`, 320);
const deletable = await upload(`Admin Delete Target ${STAMP}`, 420);
const pendingSong = await upload(`Admin Pending Target ${STAMP}`, 520);
for (const song of [editable, deletable]) {
  const approved = await api(`/api/admin/songs/${song.id}/approve`, { token: adminToken, method: "POST" });
  if (approved.status !== 200) throw new Error(`approve failed: ${approved.text.slice(0, 200)}`);
}

// the worker probes uploads asynchronously; wait for the first pass so the edit's
// re-probe is a visible change rather than the first measurement
async function waitForDuration(songId, seconds) {
  for (let i = 0; i < 30; i++) {
    const resp = await api(`/api/songs/${songId}`, { token: adminToken });
    if (resp.json?.duration_sec === seconds) return resp.json;
    await sleep(1000);
  }
  return null;
}

const probedFirst = await waitForDuration(editable.id, 4);
check("worker probed the original upload (4s tone)", probedFirst !== null, JSON.stringify(probedFirst?.duration_sec));
log("original metadata", {
  duration: probedFirst?.duration_sec,
  bitrate: probedFirst?.bitrate_kbps,
  sample_rate: probedFirst?.sample_rate,
});

const me = await api("/api/auth/me", { token: adminToken });
const session = {
  state: {
    user: me.json,
    tokens: { access_token: login.json.access_token, refresh_token: login.json.refresh_token },
  },
  version: 0,
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
await context.addInitScript((s) => localStorage.setItem("songs-auth", JSON.stringify(s)), session);
const page = await context.newPage();

// ── 1. the queue view still works, and now carries the management filters ─────
await page.goto(`${FRONTEND}/admin`, { waitUntil: "networkidle" });
await page.getByTestId("admin-filter-PENDING").waitFor({ timeout: 15000 });
const pendingRow = page.locator('[data-testid="admin-song-row"]', { hasText: pendingSong.title });
await pendingRow.waitFor({ timeout: 10000 });
check("pending song shows in the review queue", await pendingRow.isVisible());
check("queue row still offers approve/reject", (await pendingRow.getByRole("button", { name: "Approve" }).count()) === 1);
check("queue row offers direct edit/delete too", (await pendingRow.getByTestId("admin-edit").count()) === 1 && (await pendingRow.getByTestId("admin-delete").count()) === 1);
await shot(page, "admin-songs-queue");

await page.getByTestId("admin-filter-ALL").click();
await page.locator('[data-testid="admin-song-row"]', { hasText: editable.title }).waitFor({ timeout: 10000 });
const allTitles = await page.locator('[data-testid="admin-song-row"]').count();
check("All songs lists every non-deleted song", allTitles >= 3, `${allTitles} rows`);
await shot(page, "admin-songs-all");

// ── 2. edit any song directly from the list ──────────────────────────────────
const editableRow = page.locator('[data-testid="admin-song-row"]', { hasText: editable.title });
await editableRow.getByTestId("admin-edit").click();
await page.getByTestId("admin-editor").waitFor({ timeout: 10000 });
check("editor opens for an approved song", await page.getByTestId("admin-editor").isVisible());

const newTitle = `Admin Edited Title ${STAMP}`;
await page.getByTestId("admin-field-title").fill(newTitle);
await page.getByTestId("admin-field-description").fill("Rewritten by an admin");
await page.getByTestId("admin-field-genre").fill("Ambient");
await page.getByTestId("admin-field-license").selectOption("cc_by");
await page.getByTestId("admin-field-rights").fill("CC BY 4.0, admin verified");
await page.getByTestId("admin-field-note").fill("e2e: direct admin edit");
await page.getByTestId("admin-field-cover").setInputFiles({
  name: "new-cover.png",
  mimeType: "image/png",
  buffer: pngCover(96, [0x22, 0xc5, 0x5e]),
});
await page.getByTestId("admin-field-audio").setInputFiles({
  name: "new-tone.wav",
  mimeType: "audio/wav",
  buffer: toneWav({ seconds: 6, freq: 200 }),
});
await page.getByTestId("admin-audio-reprobe-hint").waitFor({ timeout: 5000 });
check("editor warns that replacing audio re-queues the probe", true);
await shot(page, "admin-songs-editor");

await page.getByTestId("admin-save").click();
await page.getByTestId("admin-editor").waitFor({ state: "detached", timeout: 15000 });
await page
  .locator('[data-testid="admin-song-row"]', { hasText: newTitle })
  .waitFor({ timeout: 10000 });
check("list row shows the edited title without a reload", true);

const afterEdit = await api(`/api/songs/${editable.id}`, { token: adminToken });
const edited = afterEdit.json;
check(
  "server has the edited metadata",
  edited.title === newTitle &&
    edited.description === "Rewritten by an admin" &&
    edited.genre === "Ambient" &&
    edited.license_type === "cc_by" &&
    edited.rights_note === "CC BY 4.0, admin verified",
  JSON.stringify({
    title: edited.title,
    description: edited.description,
    genre: edited.genre,
    license: edited.license_type,
  }),
);
check("slug follows the new title", String(edited.slug).startsWith("admin-edited-title"), edited.slug);
check("an edit does not re-open review", edited.status === "APPROVED", edited.status);
check("stored cover object was replaced", edited.cover_url !== editable.cover_url);
check("stored audio object was replaced", edited.audio_url !== editable.audio_url);

// the requirement: replacing audio re-triggers the background probe job
const newAudioKey = String(edited.audio_url).split("/media/")[1].split("?")[0];
const jobs = await api("/api/admin/jobs", { token: adminToken });
const probeForNewFile = (jobs.json ?? []).filter(
  (job) => job.type === "probe_upload" && JSON.stringify(job.payload).includes(newAudioKey),
);
check(
  "a probe job was queued for the replacement audio",
  probeForNewFile.length >= 1,
  JSON.stringify(probeForNewFile.slice(0, 2)),
);

const reprobed = await waitForDuration(editable.id, 6);
check(
  "worker recomputed the duration from the new file (4s -> 6s)",
  reprobed !== null,
  JSON.stringify({ duration: reprobed?.duration_sec }),
);
log("replacement metadata", {
  duration: reprobed?.duration_sec,
  bitrate: reprobed?.bitrate_kbps,
  sample_rate: reprobed?.sample_rate,
});
// the WAV path reports duration + sample rate from the new header (bitrate only
// comes from ffprobe), so this proves the metadata is the replacement file's
check(
  "sample rate came from the replacement file",
  reprobed?.sample_rate === 8000 && reprobed?.duration_sec === 6,
  JSON.stringify({ sample_rate: reprobed?.sample_rate, duration: reprobed?.duration_sec }),
);

// ── 3. delete any song directly from the list (soft delete) ───────────────────
/** The PWA service worker occasionally aborts a document request mid-flight. */
async function goTo(path, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(`${FRONTEND}${path}`, { waitUntil: "domcontentloaded", timeout: 25000 });
      await page.waitForTimeout(1200);
      return;
    } catch (err) {
      if (attempt >= attempts) throw err;
      await sleep(1000);
    }
  }
}

await page.getByTestId("admin-filter-ALL").click();
const deletableRow = page.locator('[data-testid="admin-song-row"]', { hasText: deletable.title });
await deletableRow.waitFor({ timeout: 10000 });
await deletableRow.getByTestId("admin-delete").click();
await page.getByTestId("admin-delete-confirm").waitFor({ timeout: 10000 });
check("delete asks for confirmation with an optional reason", true);
await shot(page, "admin-songs-delete-confirm");

await page.getByTestId("admin-delete-reason").fill("e2e: copyright claim");
await page.getByTestId("admin-delete-submit").click();
await deletableRow.waitFor({ state: "detached", timeout: 15000 });
check("deleted song disappears from the admin list", true);

const goneDetail = await api(`/api/songs/${deletable.id}`, { token: adminToken });
check("deleted song 404s even for an admin", goneDetail.status === 404, `${goneDetail.status}`);

const feed = await api("/api/songs?limit=50");
check(
  "gone from the public feed",
  !(feed.json ?? []).some((s) => s.id === deletable.id),
  `${(feed.json ?? []).length} feed songs`,
);
const search = await api(`/api/search?q=${encodeURIComponent("Admin Delete Target")}`);
check(
  "gone from search",
  !(search.json?.songs ?? []).some((s) => s.id === deletable.id),
  JSON.stringify((search.json?.songs ?? []).map((s) => s.title)),
);
const bySlug = await api(`/api/songs/by-slug/${deletable.slug}`);
check("its public URL 404s", bySlug.status === 404, `${bySlug.status}`);
const adminList = await api("/api/admin/songs?review_status=ALL", { token: adminToken });
check(
  "absent from the admin list too (soft-deleted rows are hidden)",
  !(adminList.json ?? []).some((s) => s.id === deletable.id),
);
check(
  "the other song is untouched",
  (feed.json ?? []).some((s) => s.id === editable.id),
);

// ── 3b. the removal is visible in the UI, not just in the API ─────────────────
await goTo(`/song/${deletable.slug}`);
const goneBody = await page.locator("body").innerText();
check(
  "the deleted song's page no longer renders it",
  !goneBody.includes(deletable.title),
  goneBody.slice(0, 120).replace(/\s+/g, " "),
);
await shot(page, "admin-songs-deleted-404");

await goTo(`/search?q=${encodeURIComponent("Admin Delete Target")}`);
const searchBody = await page.locator("body").innerText();
check("search page shows no trace of the deleted song", !searchBody.includes(deletable.title));
await shot(page, "admin-songs-search-after-delete");

await goTo("");
// the home sections fetch their songs after mount (skeletons first), so wait for the
// edited song to actually render before reading the page
const appeared = await page
  .getByText(newTitle)
  .first()
  .waitFor({ timeout: 20000 })
  .then(() => true)
  .catch(() => false);
const homeBody = await page.locator("body").innerText();
check(
  "home feed shows the edited song and not the deleted one",
  appeared && homeBody.includes(newTitle) && !homeBody.includes(deletable.title),
  `appeared=${appeared} hasEdited=${homeBody.includes(newTitle)} hasDeleted=${homeBody.includes(deletable.title)}`,
);
await shot(page, "admin-songs-home-after");

// ── 4. RBAC: only admins get these endpoints or the page ─────────────────────
const emptyForm = () => new FormData();
const artistEdit = await api(`/api/admin/songs/${editable.id}`, {
  token: artistToken,
  method: "PATCH",
  form: emptyForm(),
});
const artistDelete = await api(`/api/admin/songs/${editable.id}`, {
  token: artistToken,
  method: "DELETE",
});
const listenerEdit = await api(`/api/admin/songs/${editable.id}`, {
  token: listenerToken,
  method: "PATCH",
  form: emptyForm(),
});
const listenerDelete = await api(`/api/admin/songs/${editable.id}`, {
  token: listenerToken,
  method: "DELETE",
});
const anonEdit = await api(`/api/admin/songs/${editable.id}`, { method: "PATCH", form: emptyForm() });
const anonDelete = await api(`/api/admin/songs/${editable.id}`, { method: "DELETE" });
check(
  "artists and listeners are refused (403), anonymous callers 401",
  artistEdit.status === 403 &&
    artistDelete.status === 403 &&
    listenerEdit.status === 403 &&
    listenerDelete.status === 403 &&
    anonEdit.status === 401 &&
    anonDelete.status === 401,
  JSON.stringify({
    artistEdit: artistEdit.status,
    artistDelete: artistDelete.status,
    listenerEdit: listenerEdit.status,
    listenerDelete: listenerDelete.status,
    anonEdit: anonEdit.status,
    anonDelete: anonDelete.status,
  }),
);
check(
  "the refused calls changed nothing",
  (await api(`/api/songs/${editable.id}`, { token: adminToken })).json.title === newTitle,
);

const artistMe = await api("/api/auth/me", { token: artistToken });
const artistContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await artistContext.addInitScript((s) => localStorage.setItem("songs-auth", JSON.stringify(s)), {
  state: {
    user: artistMe.json,
    tokens: { access_token: artistToken, refresh_token: registered.json.refresh_token },
  },
  version: 0,
});
const artistPage = await artistContext.newPage();
await artistPage.goto(`${FRONTEND}/admin`, { waitUntil: "domcontentloaded" });
// the page renders null until the persisted auth store hydrates, so wait for the
// verdict rather than a fixed delay
await artistPage.getByText("Not authorized").waitFor({ timeout: 20000 });
const artistBody = await artistPage.locator("body").innerText();
check(
  "an artist sees “Not authorized” instead of the management UI",
  artistBody.includes("Not authorized") && !artistBody.includes("All songs"),
  artistBody.slice(0, 120).replace(/\s+/g, " "),
);
await shot(artistPage, "admin-songs-artist-blocked");

await artistContext.close();
await context.close();
await browser.close();

console.log(`\nE2E RESULT: ${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log(`FAILED: ${failures.join("; ")}`);
  process.exit(1);
}

