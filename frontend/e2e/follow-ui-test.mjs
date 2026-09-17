/**
 * E2E: Follows UI — real browser test.
 * Login via UI -> artist page -> Follow/Unfollow button + follower count ->
 * profile "Following" list.
 * Run: node e2e/follow-ui-test.mjs [frontend-url] [backend-url]
 */
import { chromium } from "playwright";

const FRONTEND = process.argv[2] ?? "http://localhost:3100";
const BACKEND = process.argv[3] ?? "http://localhost:8000";
const SUFFIX = `${Date.now() % 100000000}`;

const results = [];
function check(label, cond, extra = "") {
  results.push(cond);
  console.log(`[${cond ? "PASS" : "FAIL"}] ${label}` + (cond ? "" : ` -> ${extra}`));
}

async function api(path, { data = null, token = null } = {}) {
  const res = await fetch(`${BACKEND}${path}`, {
    method: data === null ? "GET" : "POST",
    headers: {
      ...(data !== null ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data !== null ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

const boundary = "----fui";
const mp3 = Buffer.concat([Buffer.from("ID3\x04\x00\x00\x00\x00\x00\x00", "latin1"), Buffer.alloc(512)]);
const png = Buffer.concat([Buffer.from("\x89PNG\r\n\x1a\n", "latin1"), Buffer.alloc(128)]);

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

const browser = await chromium.launch();

try {
  const artistTokens = await api("/api/auth/register", {
    data: { email: `fui-artist-${SUFFIX}@smoketest.example.com`, username: `fui_artist_${SUFFIX}`, password: "password123", is_artist: true },
  });
  const adminTokens = await api("/api/auth/register", {
    data: { email: "admin-smoke@smoketest.example.com", username: "smoke_admin", password: "password123" },
  }).catch(() => api("/api/auth/login", { data: { email: "admin-smoke@smoketest.example.com", password: "password123" } }));
  const listenerTokens = await api("/api/auth/register", {
    data: { email: `fui-listener-${SUFFIX}@smoketest.example.com`, username: `fui_user_${SUFFIX}`, password: "password123" },
  });

  const upRes = await fetch(`${BACKEND}/api/songs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${artistTokens.access_token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: multipart(
      { title: "Follow UI Song", download_allowed: "false" },
      [["audio", "t.mp3", "audio/mpeg", mp3], ["cover", "c.png", "image/png", png]],
    ),
  });
  if (!upRes.ok) throw new Error(`upload -> ${upRes.status}: ${await upRes.text()}`);
  const songData = await upRes.json();
  const approved = await api(`/api/admin/songs/${songData.id}/approve`, { token: adminTokens.access_token, data: {} });
  check("song approved", approved.status === "APPROVED");

  // Browser: login as listener through the UI
  const page = await browser.newPage();
  await page.goto(`${FRONTEND}/login`, { waitUntil: "networkidle" });
  await page.locator("input[type=email]").fill(`fui-listener-${SUFFIX}@smoketest.example.com`);
  await page.locator("input[type=password]").fill("password123");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(`${FRONTEND}/`, { timeout: 10000 });
  check("UI login ok", true);

  // Artist page: follow flow
  await page.goto(`${FRONTEND}/artists/${songData.artist_slug}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Follow artist" }).waitFor({ timeout: 5000 });
  const count0 = await page.locator("body").innerText();
  check("initial follower count 0 shown", /0\s*follower/.test(count0));

  await page.getByRole("button", { name: "Follow artist" }).click();
  await page.getByRole("button", { name: "Unfollow artist" }).waitFor({ timeout: 5000 });
  check("button becomes Following", true);
  await page
    .waitForFunction(() => /[1-9]\d*\s*follower/.test(document.body.innerText), { timeout: 5000 })
    .catch(() => {});
  const count1 = await page.locator("body").innerText();
  check("follower count 1 shown", /[1-9]\d*\s*follower/.test(count1), count1.slice(0, 150));

  // unfollow
  await page.getByRole("button", { name: "Unfollow artist" }).click();
  await page.getByRole("button", { name: "Follow artist" }).waitFor({ timeout: 5000 });
  check("unfollow returns to Follow", true);

  // Profile page: Following list
  await page.getByRole("button", { name: "Follow artist" }).click();
  await page.getByRole("button", { name: "Unfollow artist" }).waitFor({ timeout: 5000 });
  await page.goto(`${FRONTEND}/profile`, { waitUntil: "networkidle" });
  const profText = await page.locator("body").innerText();
  check("profile has Following section", profText.includes("Following"));
  check("profile lists the artist", profText.includes(`fui_artist_${SUFFIX}`));

  await page.close();
} catch (err) {
  check("unexpected error", false, String(err).slice(0, 300));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\nFOLLOW UI E2E RESULT: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
