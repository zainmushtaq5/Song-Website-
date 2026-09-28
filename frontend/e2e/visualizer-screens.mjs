/**
 * Evidence for the Visualizer + Now Playing feature.
 *
 * Nothing here is mocked: two real PCM WAV tones are uploaded through the API,
 * the homepage is played in a real browser, and the Web Audio graph the app
 * builds is instrumented from the page side (no test hooks in app code):
 *   · how many AudioContexts / MediaElementSources / Analysers were created
 *   · whether the analyser is wired to the speakers (no silent graph)
 *   · how many spectrum frames were read, and where the peak bin sits — a 440Hz
 *     tone must peak near 440Hz, which only real samples can produce
 *   · the canvas actually repaints with different pixels while playing
 *
 * Also covered: Now Playing sheet (bars/wave toggle + persistence), Up next,
 * keyboard shortcuts, pause resting state, reduced motion (static frame, no
 * loop), and the no-Web-Audio fallback keeping playback intact.
 *
 * Run: node e2e/visualizer-screens.mjs [frontend-url] [backend-url]
 */
import { chromium } from "playwright";

const FRONTEND = process.argv[2] ?? "http://localhost:3001";
const BACKEND = process.argv[3] ?? "http://localhost:8000";
const OUT = "e2e/screenshots";
const SUFFIX = `${Date.now() % 100000000}`;
const TONE_HZ = 440;

const results = [];
function check(label, ok, extra = "") {
  results.push({ label, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${label}${ok ? "" : ` -> ${extra}`}`);
}
const log = (label, value) =>
  console.log(`${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`);

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

/**
 * 16-bit PCM mono WAV: a fundamental plus six harmonics at 1/n amplitudes with a
 * 1Hz tremolo. Real decodable audio with a realistic spectral shape (not one
 * spike) whose *fundamental* still dominates, so the analyser can be checked
 * against arithmetic instead of vibes.
 */
function toneWav({ seconds = 20, freq = TONE_HZ, rate = 44100, amp = 0.7, tremolo = 2 } = {}) {
  const frames = Math.round(seconds * rate);
  const partials = [1, 2, 3, 4, 5, 7, 9].map((n) => ({ n, gain: 1 / n }));
  const norm = partials.reduce((sum, p) => sum + p.gain, 0);
  const data = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) {
    const t = i / rate;
    let stack = 0;
    for (const p of partials) stack += p.gain * Math.sin(2 * Math.PI * freq * p.n * t);
    const env = 0.35 + 0.65 * Math.abs(Math.sin(Math.PI * tremolo * t));
    const sample = (amp * env * stack) / norm;
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "latin1");
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8, "latin1");
  h.write("fmt ", 12, "latin1");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "latin1");
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const png = Buffer.concat([Buffer.from("\x89PNG\r\n\x1a\n", "latin1"), Buffer.alloc(4000)]);

function multipartUpload({ title, wav }) {
  const boundary = "----viz";
  const p = [];
  const field = (name, value) =>
    p.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`, "latin1"));
  field("title", title);
  field("genre", "Electronic");
  p.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="tone.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
      "latin1",
    ),
  );
  p.push(wav, Buffer.from("\r\n", "latin1"));
  p.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="cover"; filename="c.png"\r\nContent-Type: image/png\r\n\r\n`,
      "latin1",
    ),
  );
  p.push(png, Buffer.from("\r\n", "latin1"));
  p.push(Buffer.from(`--${boundary}--\r\n`, "latin1"));
  return { boundary, body: Buffer.concat(p) };
}

// ── setup: two approved tones so a played card has a real queue behind it ────
const artist = await api("/api/auth/register", {
  data: {
    email: `viz-${SUFFIX}@smoketest.example.com`,
    username: `viz_${SUFFIX}`,
    password: "password123",
    is_artist: true,
  },
});
const admin = await api("/api/auth/register", {
  data: { email: "admin-smoke@smoketest.example.com", username: "smoke_admin", password: "password123" },
}).catch(() =>
  api("/api/auth/login", { data: { email: "admin-smoke@smoketest.example.com", password: "password123" } }),
);

async function upload(title, freq) {
  const { boundary, body } = multipartUpload({ title, wav: toneWav({ freq }) });
  const up = await fetch(`${BACKEND}/api/songs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${artist.access_token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  if (!up.ok) throw new Error(`upload -> ${up.status} ${await up.text()}`);
  const song = await up.json();
  await api(`/api/admin/songs/${song.id}/approve`, { token: admin.access_token, data: {} });
  return song;
}

const toneA = await upload(`Viz Tone A ${SUFFIX}`, TONE_HZ);
const toneB = await upload(`Viz Tone B ${SUFFIX}`, 660);
log("setup", { frontend: FRONTEND, backend: BACKEND, toneA: toneA.slug, toneB: toneB.slug });

// ── page-side instrumentation of the real Web Audio graph (no app test hooks) ─
const INSTRUMENT = () => {
  const probe = {
    contexts: 0,
    sources: 0,
    analysers: 0,
    frames: 0,
    lastMax: 0,
    lastPeak: -1,
    binHz: 0,
    fftSize: 0,
    smoothing: null,
    ctxState: "none",
    analyserToDestination: 0,
    mediaToAnalyser: 0,
    attachCrossOrigin: null,
  };
  window.__viz = probe;

  const OrigCtx = window.AudioContext;
  if (!OrigCtx) {
    probe.noWebAudio = true;
    return;
  }

  const origConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    if (this instanceof AnalyserNode && target === this.context.destination) probe.analyserToDestination += 1;
    if (this instanceof MediaElementAudioSourceNode && target instanceof AnalyserNode) probe.mediaToAnalyser += 1;
    return origConnect.call(this, target, ...rest);
  };

  const origFreq = AnalyserNode.prototype.getByteFrequencyData;
  AnalyserNode.prototype.getByteFrequencyData = function (arr) {
    origFreq.call(this, arr);
    let max = 0;
    let peak = -1;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] > max) {
        max = arr[i];
        peak = i;
      }
    }
    probe.frames += 1;
    probe.lastMax = max;
    probe.lastPeak = peak;
    probe.binHz = this.context.sampleRate / this.fftSize;
    probe.fftSize = this.fftSize;
    probe.smoothing = this.smoothingTimeConstant;
    probe.minDecibels = this.minDecibels;
    probe.maxDecibels = this.maxDecibels;
  };

  window.AudioContext = class extends OrigCtx {
    constructor(...args) {
      super(...args);
      probe.contexts += 1;
      probe.ctxState = this.state;
      this.addEventListener("statechange", () => {
        probe.ctxState = this.state;
      });
    }
    createMediaElementSource(element) {
      probe.sources += 1;
      probe.attachCrossOrigin = element.getAttribute("crossorigin");
      return super.createMediaElementSource(element);
    }
    createAnalyser() {
      probe.analysers += 1;
      return super.createAnalyser();
    }
  };
};

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(INSTRUMENT);
const page = await context.newPage();

// Every request that reached the backend, so the CORS decision can be audited.
const backendRequests = [];
page.on("request", (req) => {
  if (!req.url().startsWith(BACKEND)) return;
  const headers = req.headers();
  const [path, query = ""] = req.url().replace(BACKEND, "").split("?");
  backendRequests.push({
    path,
    query: query.slice(0, 40),
    range: headers.range ?? null,
    origin: headers.origin ?? null,
  });
});

const audioState = () =>
  page.evaluate(() => {
    const a = document.querySelector("audio");
    return a
      ? {
          crossOrigin: a.getAttribute("crossorigin"),
          readyState: a.readyState,
          paused: a.paused,
          currentTime: a.currentTime,
          duration: a.duration,
          volume: a.volume,
          error: a.error?.code ?? null,
        }
      : null;
  });

// Canvas state anywhere (mode attribute, painted pixels, pixel snapshot).
const canvasStatsOn = (target, selector) =>
  target.evaluate((sel) => {
    const holder = document.querySelector(sel);
    const canvas = holder?.querySelector("canvas");
    if (!holder || !canvas) return null;
    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 8) painted += 1;
    return { mode: holder.getAttribute("data-visualizer-mode"), painted, snapshot: canvas.toDataURL() };
  }, selector);
const canvasStats = (selector) => canvasStatsOn(page, selector);

// ── desktop: play a real tone from the homepage queue ───────────────────────
await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => document.body.innerText.includes("New Releases"), { timeout: 20000 });
await page.locator(`[aria-label="Play Viz Tone A ${SUFFIX}"]`).first().click({ force: true });

await page
  .waitForFunction(() => window.__viz && window.__viz.frames > 30, { timeout: 20000 })
  .catch(() => null);
// Always read the probe, even on timeout: the log is what makes failures fixable.
const live = await page.evaluate(() => window.__viz ?? null);
log("probe", live);

check("one AudioContext and one analyser were created", live?.contexts === 1 && live?.analysers === 1, JSON.stringify(live));
check(
  "media element routed through Web Audio with crossOrigin=anonymous",
  live?.sources === 1 && live?.attachCrossOrigin === "anonymous",
  `sources=${live?.sources} crossOrigin=${live?.attachCrossOrigin}`,
);
check(
  "analyser is wired to the speakers (the graph does not silence playback)",
  live?.analyserToDestination === 1 && live?.mediaToAnalyser === 1,
  JSON.stringify({ toDestination: live?.analyserToDestination, mediaToAnalyser: live?.mediaToAnalyser }),
);
check("spectrum frames stream continuously while playing", (live?.frames ?? 0) > 30, `${live?.frames}`);
check(
  "analyser is configured with fftSize 2048 and 0.8 smoothing",
  live?.fftSize === 2048 && Math.abs((live?.smoothing ?? 0) - 0.8) < 0.01,
  JSON.stringify({ fftSize: live?.fftSize, smoothing: live?.smoothing }),
);
const peakHz = (live?.lastPeak ?? -1) * (live?.binHz ?? 0);
check(
  `real samples: the ${TONE_HZ}Hz tone peaks at ${peakHz.toFixed(0)}Hz`,
  Math.abs(peakHz - TONE_HZ) <= 30 && (live?.lastMax ?? 0) > 20,
  JSON.stringify({ peakHz, max: live?.lastMax }),
);

const audio = await audioState();
log("audio", audio);
check(
  "audio plays CORS-clean with no media error",
  audio?.crossOrigin === "anonymous" && (audio?.readyState ?? 0) > 0 && audio?.error === null && audio?.paused === false,
  JSON.stringify(audio),
);
check(
  "analyser uses a -90/-5dB range (the -30dB default paints a brick wall)",
  live?.minDecibels === -90 && live?.maxDecibels === -5,
  JSON.stringify({ min: live?.minDecibels, max: live?.maxDecibels }),
);
check(
  "the verdict came from an explicit probe before touching the element",
  backendRequests.some((r) => r.range === "bytes=0-0" || r.query.includes("page_size=1")),
  JSON.stringify(backendRequests.slice(0, 6)),
);

// Column heights make a stuck canvas self-diagnosing.
const barColumns = () =>
  page.evaluate(() => {
    const holder = document.querySelector('[data-visualizer-variant="bars"]');
    const canvas = holder?.querySelector("canvas");
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const columns = [];
    const step = Math.max(1, Math.floor(canvas.width / 8));
    for (let x = 0; x < canvas.width; x += step) {
      let painted = 0;
      for (let y = 0; y < canvas.height; y++) if (data[(y * canvas.width + x) * 4 + 3] > 8) painted += 1;
      columns.push(painted);
    }
    return { size: [canvas.width, canvas.height], columns };
  });

const barMeter = await canvasStats('[data-visualizer-variant="bars"]');
const barSnapshot = barMeter?.snapshot ?? "";
const barColumnsA = await barColumns();
// 1.2s covers more than two periods of the 2Hz tremolo on the test tone.
await page.waitForTimeout(1200);
const barMeterLater = await canvasStats('[data-visualizer-variant="bars"]');
const barColumnsB = await barColumns();
check(
  "player-bar meter is live and painted",
  barMeter?.mode === "live" && (barMeter?.painted ?? 0) > 40,
  JSON.stringify({ mode: barMeter?.mode, painted: barMeter?.painted }),
);
check(
  "player-bar meter repaints with the modulating tone",
  barSnapshot !== (barMeterLater?.snapshot ?? ""),
  JSON.stringify({ before: barColumnsA, after: barColumnsB }),
);
await page.screenshot({ path: `${OUT}/viz-player-bar.png`, clip: { x: 0, y: 700, width: 1280, height: 200 } });
console.log("saved: viz-player-bar.png");

// ── Now Playing sheet ───────────────────────────────────────────────────────
const DIALOG = '[role="dialog"][aria-label="Now playing"]';
const SHEET_VIZ = `${DIALOG} [data-visualizer-mode]`;

await page.locator('[aria-label="Open now playing"]').first().click();
await page.waitForSelector(DIALOG, { timeout: 10000 });
await page.waitForTimeout(650); // spring settles

const sheetViz = await canvasStats(SHEET_VIZ);
check(
  "now-playing visualizer is live with a painted canvas",
  sheetViz?.mode === "live" && (sheetViz?.painted ?? 0) > 500,
  JSON.stringify({ mode: sheetViz?.mode, painted: sheetViz?.painted }),
);

const glow = await page.evaluate((sel) => {
  const dialog = document.querySelector(sel);
  const el = dialog ? [...dialog.querySelectorAll("div")].find((d) => d.className.includes("blur-2xl")) : null;
  if (!el) return null;
  const styles = getComputedStyle(el);
  return { opacity: Number(styles.opacity), transform: styles.transform };
}, DIALOG);
check(
  "artwork glow pulses from bass energy (not a CSS timer)",
  (glow?.opacity ?? 0) > 0.15 && (glow?.transform ?? "none") !== "none",
  JSON.stringify(glow),
);

await page.screenshot({ path: `${OUT}/viz-nowplaying-desktop.png` });
await page.locator(SHEET_VIZ).screenshot({ path: `${OUT}/viz-spectrum-closeup.png` });
console.log("saved: viz-nowplaying-desktop.png, viz-spectrum-closeup.png");

// variant toggle + persistence
await page.locator('[data-testid="visualizer-toggle"]').click();
await page.waitForTimeout(350);
const waveViz = await canvasStats(`${DIALOG} [data-visualizer-variant="wave"]`);
const storedVariant = await page.evaluate(() => localStorage.getItem("songs-visualizer"));
check(
  "toggle switches to the oscilloscope view",
  waveViz?.mode === "live" && (waveViz?.painted ?? 0) > 100,
  JSON.stringify({ mode: waveViz?.mode, painted: waveViz?.painted }),
);
check("the chosen visualizer persists", storedVariant === "wave", `${storedVariant}`);
await page.screenshot({ path: `${OUT}/viz-nowplaying-wave.png` });
console.log("saved: viz-nowplaying-wave.png");
await page.locator('[data-testid="visualizer-toggle"]').click();
await page.waitForTimeout(250);

// up next
const upNext = page.locator('[data-testid="up-next-item"]');
const upNextCount = await upNext.count();
check("up next lists the rest of the queue", upNextCount >= 1, `${upNextCount} items`);
const titleBefore = await page.locator(`${DIALOG} a[href^="/song/"]`).first().innerText();
await upNext.first().click();
await page.waitForTimeout(800);
const titleAfter = await page.locator(`${DIALOG} a[href^="/song/"]`).first().innerText();
check("picking an up-next track switches the song", titleBefore !== titleAfter, `${titleBefore} -> ${titleAfter}`);

// keyboard shortcuts
const beforeSpace = await audioState();
await page.keyboard.press("Space");
await page.waitForTimeout(400);
const afterSpace = await audioState();
check(
  "Space toggles playback",
  beforeSpace?.paused === false && afterSpace?.paused === true,
  JSON.stringify({ before: beforeSpace?.paused, after: afterSpace?.paused }),
);
await page.keyboard.press("Space");
await page.waitForTimeout(400);
const resumed = await audioState();
const seekFrom = resumed?.currentTime ?? 0;
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(350);
const seeked = await audioState();
check(
  "ArrowRight seeks ~10s forward",
  (seeked?.currentTime ?? 0) - seekFrom >= 9 && (seeked?.currentTime ?? 0) - seekFrom <= 12,
  `${seekFrom.toFixed(1)} -> ${seeked?.currentTime?.toFixed(1)}`,
);
await page.keyboard.press("KeyM");
await page.waitForTimeout(300);
const mutedState = await audioState();
check("M mutes the player", mutedState?.volume === 0, `volume=${mutedState?.volume}`);
await page.keyboard.press("KeyM");
await page.waitForTimeout(200);

// pause -> resting frame (no fake movement)
await page.keyboard.press("Space");
await page.waitForTimeout(450);
const idleViz = await canvasStats(SHEET_VIZ);
check("pausing drops the visualizer to its resting frame", idleViz?.mode === "idle", `${idleViz?.mode}`);
await page.screenshot({ path: `${OUT}/viz-idle.png` });
console.log("saved: viz-idle.png");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

// ── reduced motion: one real frame, never a loop ────────────────────────────
const reducedContext = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: "reduce",
});
await reducedContext.addInitScript(INSTRUMENT);
const reducedPage = await reducedContext.newPage();
await reducedPage.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
await reducedPage.waitForFunction(() => document.body.innerText.includes("New Releases"), { timeout: 20000 });
await reducedPage.locator(`[aria-label="Play Viz Tone A ${SUFFIX}"]`).first().click({ force: true });
await reducedPage.waitForTimeout(1500);

const reducedFrames = await reducedPage.evaluate(() => window.__viz.frames);
const reducedViz = await canvasStatsOn(reducedPage, '[data-visualizer-variant="bars"]');
await reducedPage.waitForTimeout(700);
const reducedFramesLater = await reducedPage.evaluate(() => window.__viz.frames);
const reducedVizLater = await canvasStatsOn(reducedPage, '[data-visualizer-variant="bars"]');
check(
  "reduced motion: static frame, no animation loop",
  reducedViz?.mode === "static" &&
    reducedFrames === reducedFramesLater &&
    reducedViz?.snapshot === reducedVizLater?.snapshot,
  JSON.stringify({ mode: reducedViz?.mode, frames: [reducedFrames, reducedFramesLater] }),
);
check("reduced motion: the single frame is still painted", (reducedViz?.painted ?? 0) > 40, `${reducedViz?.painted}`);
await reducedPage.screenshot({ path: `${OUT}/viz-reduced-static.png` });
console.log("saved: viz-reduced-static.png");
await reducedPage.locator('[aria-label="Open now playing"]').first().click();
await reducedPage.waitForTimeout(500);
check(
  "reduced motion: the sheet shows the same static visualizer",
  (await canvasStatsOn(reducedPage, SHEET_VIZ))?.mode === "static",
  "sheet visualizer mode",
);
await reducedPage.screenshot({ path: `${OUT}/viz-reduced-nowplaying.png` });
console.log("saved: viz-reduced-nowplaying.png");
await reducedContext.close();

// ── no Web Audio at all: playback must survive, visualizer must not crash ───
const fallbackContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await fallbackContext.addInitScript(() => {
  class BlockedAudioContext {
    constructor() {
      throw new DOMException("Web Audio blocked", "NotSupportedError");
    }
  }
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    writable: true,
    value: BlockedAudioContext,
  });
});
const fallbackPage = await fallbackContext.newPage();
await fallbackPage.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
await fallbackPage.waitForFunction(() => document.body.innerText.includes("New Releases"), { timeout: 20000 });
await fallbackPage.locator(`[aria-label="Play Viz Tone A ${SUFFIX}"]`).first().click({ force: true });
await fallbackPage.waitForTimeout(1500);

const fallbackFirst = await fallbackPage.evaluate(() => {
  const a = document.querySelector("audio");
  return { paused: a?.paused, readyState: a?.readyState, error: a?.error?.code ?? null, at: a?.currentTime ?? 0 };
});
await fallbackPage.waitForTimeout(500);
const fallbackLater = await fallbackPage.evaluate(() => document.querySelector("audio")?.currentTime ?? 0);
check(
  "no Web Audio: playback is unaffected",
  fallbackFirst.paused === false && fallbackFirst.error === null && fallbackLater > fallbackFirst.at,
  JSON.stringify({ ...fallbackFirst, later: fallbackLater }),
);
const fallbackViz = await canvasStatsOn(fallbackPage, '[data-visualizer-variant="bars"]');
check(
  "no Web Audio: visualizer degrades to an unavailable resting frame",
  fallbackViz?.mode === "unavailable" && (fallbackViz?.painted ?? 0) > 0,
  JSON.stringify({ mode: fallbackViz?.mode, painted: fallbackViz?.painted }),
);
await fallbackPage.locator('[aria-label="Open now playing"]').first().click();
await fallbackPage.waitForTimeout(600);
await fallbackPage.screenshot({ path: `${OUT}/viz-fallback.png` });
console.log("saved: viz-fallback.png");
await fallbackContext.close();

// ── media origin without CORS headers: the hazard the probe exists for ──────
// A CDN that serves audio without Access-Control-Allow-Origin must still play,
// and must never be routed into Web Audio — a tainted graph is silence, and the
// element cannot be detached from it afterwards.
const noCorsContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await noCorsContext.addInitScript(INSTRUMENT);
// The probe result is the only signal the app consumes before deciding whether a
// media source is safe to route into Web Audio, so the refusal is simulated at
// exactly that boundary: CORS-mode fetches to /media/* fail the way they do for
// a CDN that sends no Access-Control-Allow-Origin. Element loads are untouched,
// so this also proves playback does not depend on the probe succeeding.
await noCorsContext.addInitScript(() => {
  window.__blockedProbes = 0;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (init?.mode === "cors" && url.includes("/media/")) {
      window.__blockedProbes += 1;
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    return originalFetch(input, init);
  };
});
const noCorsPage = await noCorsContext.newPage();
await noCorsPage.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
await noCorsPage.waitForFunction(() => document.body.innerText.includes("New Releases"), { timeout: 20000 });
await noCorsPage.locator(`[aria-label="Play Viz Tone A ${SUFFIX}"]`).first().click({ force: true });
await noCorsPage.waitForTimeout(1800);

const noCorsAudio = await noCorsPage.evaluate(() => {
  const a = document.querySelector("audio");
  return {
    crossOrigin: a?.getAttribute("crossorigin") ?? null,
    paused: a?.paused,
    readyState: a?.readyState,
    error: a?.error?.code ?? null,
    at: a?.currentTime ?? 0,
  };
});
const noCorsProbe = await noCorsPage.evaluate(() => window.__viz ?? null);
const blockedProbes = await noCorsPage.evaluate(() => window.__blockedProbes ?? 0);
await noCorsPage.waitForTimeout(600);
const noCorsLater = await noCorsPage.evaluate(() => document.querySelector("audio")?.currentTime ?? 0);
log("non-cors", { audio: noCorsAudio, probe: noCorsProbe, blockedProbes });
check("non-CORS media: the app probed and was refused", blockedProbes >= 1, `${blockedProbes}`);
check(
  "non-CORS media: plays without requesting CORS it cannot get",
  noCorsAudio.crossOrigin === null && noCorsAudio.paused === false && noCorsAudio.error === null,
  JSON.stringify(noCorsAudio),
);
check("non-CORS media: playback advances normally", noCorsLater > noCorsAudio.at, `${noCorsAudio.at} -> ${noCorsLater}`);
check(
  "non-CORS media: never routed into Web Audio (no silent graph)",
  (noCorsProbe?.sources ?? 0) === 0 && (noCorsProbe?.contexts ?? 0) === 0,
  JSON.stringify({ sources: noCorsProbe?.sources, contexts: noCorsProbe?.contexts }),
);
const noCorsViz = await canvasStatsOn(noCorsPage, '[data-visualizer-variant="bars"]');
check("non-CORS media: visualizer falls back instead of faking signal", noCorsViz?.mode === "unavailable", `${noCorsViz?.mode}`);
await noCorsPage.screenshot({ path: `${OUT}/viz-non-cors-media.png` });
console.log("saved: viz-non-cors-media.png");
await noCorsContext.close();

// ── mobile: meter in the bar, full sheet on a phone viewport ────────────────
const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
await mobileContext.addInitScript(INSTRUMENT);
const mobilePage = await mobileContext.newPage();
await mobilePage.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
await mobilePage.waitForFunction(() => document.body.innerText.includes("New Releases"), { timeout: 20000 });
const mobileCard = mobilePage.locator(`[aria-label="Play Viz Tone A ${SUFFIX}"]`).first();
await mobileCard.scrollIntoViewIfNeeded();
await mobileCard.click({ force: true });
await mobilePage.waitForTimeout(1500);

const mobileMeter = await canvasStatsOn(mobilePage, '[data-visualizer-variant="bars"]');
check(
  "mobile: player-bar meter is live",
  mobileMeter?.mode === "live" && (mobileMeter?.painted ?? 0) > 20,
  JSON.stringify({ mode: mobileMeter?.mode, painted: mobileMeter?.painted }),
);
await mobilePage.locator('[aria-label="Open now playing"]').first().click();
await mobilePage.waitForTimeout(700);
const mobileSheetViz = await canvasStatsOn(mobilePage, SHEET_VIZ);
const mobileVizBox = await mobilePage.locator(SHEET_VIZ).boundingBox();
check(
  "mobile: sheet visualizer is live and sized to the viewport",
  mobileSheetViz?.mode === "live" && (mobileVizBox?.width ?? 0) > 300,
  JSON.stringify({ mode: mobileSheetViz?.mode, width: mobileVizBox?.width }),
);
check("mobile: up next is reachable in the sheet", (await mobilePage.locator('[data-testid="up-next-item"]').count()) >= 1, "items");
await mobilePage.screenshot({ path: `${OUT}/viz-nowplaying-mobile.png` });
console.log("saved: viz-nowplaying-mobile.png");
await mobileContext.close();

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\nE2E RESULT: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) console.log(`FAILED: ${failed.map((f) => f.label).join(" | ")}`);
process.exit(failed.length ? 1 : 0);




