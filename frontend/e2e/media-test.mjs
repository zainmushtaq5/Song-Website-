/**
 * E2E: signed-media URL resolution.
 * Loads the song detail page in a real browser and verifies:
 *  1. The cover <img> src points at the BACKEND origin (:8000), not the frontend.
 *  2. The image actually loads (naturalWidth > 0 => HTTP 200 from /media).
 *  3. Clicking play sets the <audio> src to the backend origin.
 *  4. No /media request is ever made to the frontend origin; all /media requests
 *     to the backend return 200.
 *
 * Run: node e2e/media-test.mjs [frontend-url] [backend-url]
 */
import { chromium } from "playwright";

const FRONTEND = process.argv[2] ?? "http://localhost:3000";
const BACKEND = process.argv[3] ?? "http://localhost:8000";

const slug = await fetch(`${BACKEND}/api/songs`)
  .then((r) => r.json())
  .then((songs) => songs[0]?.slug);
if (!slug) {
  console.log("FAIL: no approved song found on the backend feed");
  process.exit(1);
}
console.log(`Testing song page: ${FRONTEND}/song/${slug}`);

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
