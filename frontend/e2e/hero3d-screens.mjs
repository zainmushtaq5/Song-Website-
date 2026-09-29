/**
 * Evidence for Feature 5 (3D hero).
 *
 * Everything is measured from outside the app:
 *   · WebGL contexts and draw calls are counted by patching
 *     HTMLCanvasElement.getContext + the draw entry points, so "is it
 *     rendering / did it stop" is observed, not asserted from intent
 *   · three.js is located by diffing the JS chunks a route requests against a
 *     non-homepage route, and by searching the fetched chunk bodies — this
 *     proves the library ships with the homepage and nowhere else
 *   · frame rate is measured from draw calls, which is what the tablet tier caps
 *
 * Run: node e2e/hero3d-screens.mjs [frontend-url] [backend-url]
 */
import { chromium } from "playwright";

const FRONTEND = process.argv[2] ?? "http://localhost:3001";
const BACKEND = process.argv[3] ?? "http://localhost:8000";
const OUT = "e2e/screenshots";
/** A three.js internal that survives minification in the shipped bundle. */
const THREE_MARKER = "WebGLRenderer";

const results = [];
function check(label, ok, extra = "") {
  results.push({ label, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${label}${ok ? "" : ` -> ${extra}`}`);
}
const log = (label, value) =>
  console.log(`${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`);

/** Count WebGL contexts, rendered frames and draw calls without touching app code. */
const GL_PROBE = () => {
  const probe = { contexts: 0, liveContexts: 0, frames: 0, draws: 0 };
  window.__gl = probe;
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const context = original.call(this, type, ...rest);
    if (context && /webgl/i.test(String(type))) {
      probe.contexts += 1;
      // A canvas that is not in the document is a capability probe, not a hero.
      if (this.isConnected) probe.liveContexts += 1;
      // three clears once per rendered frame, so this counts frames rather than
      // the 4-8 draw calls each frame is made of.
      const clear = context.clear;
      if (typeof clear === "function") {
        context.clear = function (...args) {
          probe.frames += 1;
          return clear.apply(this, args);
        };
      }
      for (const name of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
        const fn = context[name];
        if (typeof fn !== "function") continue;
        context[name] = function (...args) {
          probe.draws += 1;
          return fn.apply(this, args);
        };
      }
    }
    return context;
  };
};

const draws = (page) => page.evaluate(() => window.__gl?.draws ?? 0);
const frames = (page) => page.evaluate(() => window.__gl?.frames ?? 0);
const heroState = (page) =>
  page.evaluate(() => {
    const backdrop = document.querySelector("[data-hero-tier]");
    const canvas = backdrop?.querySelector("canvas");
    const box = canvas?.getBoundingClientRect();
    return {
      tier: backdrop?.getAttribute("data-hero-tier") ?? null,
      active: backdrop?.getAttribute("data-hero-active") ?? null,
      reduced: backdrop?.getAttribute("data-hero-reduced") ?? null,
      hasCanvas: Boolean(canvas),
      canvasSize: box ? [Math.round(box.width), Math.round(box.height)] : null,
      fallbackWaveform: Boolean(backdrop?.querySelector("svg")),
    };
  });

/** Rendered frames per second, sampled over a window (headless GL is software). */
async function frameRate(page, ms = 1500) {
  const before = await frames(page);
  await page.waitForTimeout(ms);
  const after = await frames(page);
  return ((after - before) * 1000) / ms;
}

const chunksRequested = (page) => {
  const seen = new Set();
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/_next/static/chunks/")) seen.add(url);
  });
  return seen;
};

async function chunkFacts(urls) {
  const facts = [];
  for (const url of urls) {
    const text = await fetch(url).then((r) => r.text());
    facts.push({ url: url.split("/").pop(), bytes: text.length, hasThree: text.includes(THREE_MARKER) });
  }
  return facts;
}

const browser = await chromium.launch();

// ── 1. bundle isolation: which chunks does the homepage pull that /privacy does not?
const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await desktopContext.addInitScript(GL_PROBE);
const desktop = await desktopContext.newPage();
const desktopChunks = chunksRequested(desktop);

await desktop.goto(`${FRONTEND}/privacy`, { waitUntil: "networkidle" });
const baseChunks = new Set(desktopChunks);
await desktop.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
const homeChunks = new Set(desktopChunks);
const extraChunks = [...homeChunks].filter((url) => !baseChunks.has(url));

const baseFacts = await chunkFacts([...baseChunks]);
const extraFacts = await chunkFacts(extraChunks);
const extraBytes = extraFacts.reduce((sum, f) => sum + f.bytes, 0);
log("chunks", {
  privacy: baseFacts.length,
  homepage: homeChunks.size,
  homepageOnly: extraFacts.length,
  homepageOnlyBytes: extraBytes,
  threeInHomepageOnly: extraFacts.filter((f) => f.hasThree).map((f) => f.url),
});
check(
  "three.js ships in homepage-only chunks",
  extraFacts.some((f) => f.hasThree),
  JSON.stringify(extraFacts.slice(0, 6)),
);
check(
  "other routes never receive the three.js chunks",
  baseFacts.every((f) => !f.hasThree),
  JSON.stringify(baseFacts.filter((f) => f.hasThree)),
);
check(
  "the homepage-only payload is the 3D bundle, not accidental growth",
  extraBytes > 200_000,
  `${extraBytes} bytes`,
);

// ── 2. desktop: full tier, live rendering, stops off-screen / when hidden ────
const desktopHero = await heroState(desktop);
log("desktop", desktopHero);
check("desktop gets the full tier with a canvas", desktopHero.tier === "full" && desktopHero.hasCanvas, JSON.stringify(desktopHero));
check(
  "desktop canvas fills the hero band",
  (desktopHero.canvasSize?.[0] ?? 0) > 600 && (desktopHero.canvasSize?.[1] ?? 0) > 200,
  JSON.stringify(desktopHero.canvasSize),
);
const desktopGl = await desktop.evaluate(() => ({ ...window.__gl }));
log("desktop-gl", { contexts: desktopGl.contexts, liveContexts: desktopGl.liveContexts });
check(
  "a WebGL context was created for the hero canvas (the higher count is the capability probe)",
  desktopGl.liveContexts >= 1,
  JSON.stringify(desktopGl),
);

const desktopRate = await frameRate(desktop, 1500);
const desktopDrawsPerFrame = (await draws(desktop)) / Math.max(1, await frames(desktop));
log("desktop-render", { framesPerSecond: Math.round(desktopRate), drawsPerFrame: Number(desktopDrawsPerFrame.toFixed(2)) });
check("desktop renders continuously while visible", desktopRate > 20, `${desktopRate.toFixed(1)}fps`);
await desktop.screenshot({ path: `${OUT}/hero3d-desktop.png` });
console.log("saved: hero3d-desktop.png");

// off-screen: the loop must stop, and resume on the way back
await desktop.evaluate(() => window.scrollTo(0, 3000));
await desktop.waitForTimeout(700);
const offscreenRate = await frameRate(desktop, 800);
const offscreenState = await heroState(desktop);
check(
  "rendering stops while the hero is off-screen",
  offscreenRate === 0 && offscreenState.active === "false",
  `rate=${offscreenRate.toFixed(1)}/s active=${offscreenState.active}`,
);

await desktop.evaluate(() => window.scrollTo(0, 0));
await desktop.waitForTimeout(600);
const resumedRate = await frameRate(desktop, 1000);
check("rendering resumes when the hero scrolls back in", resumedRate > 5, `${resumedRate.toFixed(1)}/s`);

// hidden tab: same code path the browser fires on tab switch
await desktop.evaluate(() => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
});
await desktop.waitForTimeout(600);
const hiddenRate = await frameRate(desktop, 800);
const hiddenState = await heroState(desktop);
check(
  "rendering stops while the tab is hidden",
  hiddenRate === 0 && hiddenState.active === "false",
  `rate=${hiddenRate.toFixed(1)}/s active=${hiddenState.active}`,
);
await desktop.evaluate(() => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  document.dispatchEvent(new Event("visibilitychange"));
});
await desktop.waitForTimeout(600);
check("rendering resumes when the tab is visible again", (await frameRate(desktop, 1000)) > 5, "draws/s");
await desktopContext.close();

// ── 3. reduced motion: one static frame, never an animation loop ─────────────
const reducedContext = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
await reducedContext.addInitScript(GL_PROBE);
const reducedPage = await reducedContext.newPage();
const reducedChunks = chunksRequested(reducedPage);
await reducedPage.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });

const reducedHero = await heroState(reducedPage);
log("reduced", reducedHero);
check(
  "reduced motion still gets the composed static frame",
  reducedHero.hasCanvas && reducedHero.reduced === "true" && reducedHero.tier === "full",
  JSON.stringify(reducedHero),
);
await reducedPage.waitForTimeout(800);
const staticRate = await frameRate(reducedPage, 1200);
check("reduced motion draws no animation loop", staticRate === 0, `${staticRate.toFixed(1)}/s`);
check(
  "reduced motion still loads the scene bundle once",
  [...reducedChunks].length > 0 && (await chunkFacts([...reducedChunks])).some((f) => f.hasThree),
  "three chunk requested",
);
await reducedPage.screenshot({ path: `${OUT}/hero3d-reduced.png` });
console.log("saved: hero3d-reduced.png");
await reducedContext.close();

// ── 4. tablet: lite tier, reduced geometry, 30fps cap ───────────────────────
const tabletContext = await browser.newContext({ viewport: { width: 834, height: 1112 } });
await tabletContext.addInitScript(GL_PROBE);
const tablet = await tabletContext.newPage();
await tablet.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
const tabletHero = await heroState(tablet);
log("tablet", tabletHero);
check("tablet gets the reduced tier", tabletHero.tier === "lite" && tabletHero.hasCanvas, JSON.stringify(tabletHero));

await tablet.waitForTimeout(600);
const tabletRate = await frameRate(tablet, 2000);
const tabletDrawsPerFrame = (await draws(tablet)) / Math.max(1, await frames(tablet));
log("tablet-render", { framesPerSecond: Math.round(tabletRate), drawsPerFrame: Number(tabletDrawsPerFrame.toFixed(2)) });
check("tablet frame rate is capped at 30fps", tabletRate > 2 && tabletRate <= 34, `${tabletRate.toFixed(1)}fps`);
check(
  "tablet renders fewer objects per frame (no reflection, fewer bars/particles)",
  tabletDrawsPerFrame < desktopDrawsPerFrame,
  `tablet=${tabletDrawsPerFrame.toFixed(2)} desktop=${desktopDrawsPerFrame.toFixed(2)} draws/frame`,
);
await tablet.screenshot({ path: `${OUT}/hero3d-tablet.png` });
console.log("saved: hero3d-tablet.png");
await tabletContext.close();

// ── 5. mobile: no 3D bundle at all, gradient hero only ──────────────────────
const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
await mobileContext.addInitScript(GL_PROBE);
const mobile = await mobileContext.newPage();
const mobileChunks = chunksRequested(mobile);
await mobile.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
await mobile.waitForTimeout(1200);

const mobileHero = await heroState(mobile);
log("mobile", { ...mobileHero, chunks: mobileChunks.size });
check("mobile keeps the CSS-only hero", mobileHero.tier === "none" && !mobileHero.hasCanvas, JSON.stringify(mobileHero));
check("mobile shows the decorative waveform fallback instead", mobileHero.fallbackWaveform, JSON.stringify(mobileHero));
const mobileFacts = await chunkFacts([...mobileChunks]);
check(
  "mobile never downloads three.js",
  mobileFacts.every((f) => !f.hasThree),
  JSON.stringify(mobileFacts.filter((f) => f.hasThree).map((f) => f.url)),
);
const mobileGl = await mobile.evaluate(() => ({ ...window.__gl }));
log("mobile-gl", mobileGl);
check(
  "mobile creates no hero canvas or WebGL context (only the detached capability probe)",
  mobileGl.liveContexts === 0,
  JSON.stringify(mobileGl),
);
await mobile.screenshot({ path: `${OUT}/hero3d-mobile.png` });
console.log("saved: hero3d-mobile.png");
await mobileContext.close();

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\nE2E RESULT: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) console.log(`FAILED: ${failed.map((f) => f.label).join(" | ")}`);
process.exit(failed.length ? 1 : 0);


