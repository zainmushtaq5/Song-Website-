/**
 * Evidence for Phase 4.3 (PWA): manifest validity, icon files, service worker,
 * install-prompt flow, offline shell/banner and the standalone app shell.
 *
 * Requires a PRODUCTION server (the worker is prod-only):
 *   npm run build && npx next start -p 3002
 *   node e2e/pwa-screens.mjs http://localhost:3002
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3002";
const OUT = "e2e/screenshots";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const log = (label, value) => {
  console.log(`${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
};

/* ── 1. manifest + assets over plain HTTP ─────────────────────────────────── */
const manifestRes = await fetch(`${BASE}/manifest.webmanifest`);
const manifestType = manifestRes.headers.get("content-type") ?? "";
const manifest = await manifestRes.json();
log("manifest-status", manifestRes.status);
log("manifest-content-type", manifestType);
log("manifest-payload", {
  name: manifest.name,
  short_name: manifest.short_name,
  start_url: manifest.start_url,
  scope: manifest.scope,
  display: manifest.display,
  theme_color: manifest.theme_color,
  background_color: manifest.background_color,
  icon_sizes: manifest.icons.map((i) => `${i.sizes}:${i.purpose}`),
  shortcuts: manifest.shortcuts.map((s) => s.url),
});

// Every declared icon must exist, be a real PNG and match its declared size.
const iconChecks = [];
for (const icon of manifest.icons) {
  const res = await fetch(`${BASE}${icon.src}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const actual = `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
  iconChecks.push({
    src: icon.src,
    status: res.status,
    type: res.headers.get("content-type"),
    png: isPng,
    actual,
    declared: icon.sizes,
    fits: actual === icon.sizes,
  });
}
log("manifest-icons", iconChecks);
log("apple-touch-icon", (await fetch(`${BASE}/icons/apple-touch-icon.png`)).status);
log("favicon-ico", (await fetch(`${BASE}/favicon.ico`)).status);

// The worker script must be revalidated on every load and allowed to claim the origin.
const swRes = await fetch(`${BASE}/sw.js`);
log("sw-headers", {
  status: swRes.status,
  cacheControl: swRes.headers.get("cache-control"),
  serviceWorkerAllowed: swRes.headers.get("service-worker-allowed"),
});

const offlineRes = await fetch(`${BASE}/offline`);
const offlineHtml = await offlineRes.text();
log("offline-route", { status: offlineRes.status, hasShell: offlineHtml.includes("offline-shell") });

/* ── 2. mobile browser context ────────────────────────────────────────────── */
const browser = await chromium.launch();
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await mobile.newPage();
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

const head = await page.evaluate(() => ({
  manifests: [...document.querySelectorAll('link[rel="manifest"]')].map((l) => l.getAttribute("href")),
  themeColor: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute("content")),
  appleTouch: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href") ?? null,
  favicon: document.querySelector('link[rel="icon"]')?.getAttribute("href") ?? null,
  viewport: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? null,
  displayMode: document.documentElement.dataset.displayMode ?? null,
}));
log("document-head", head);

await page.screenshot({ path: `${OUT}/pwa-shell-mobile.png` });
log("saved", "pwa-shell-mobile.png");

/* ── 3. service worker activation ─────────────────────────────────────────── */
const swInfo = await page.evaluate(async () => {
  const registration = await navigator.serviceWorker.ready;
  return { scope: registration.scope, state: registration.active?.state ?? null };
});
await page.reload({ waitUntil: "networkidle" });
const control = await page.evaluate(async () => ({
  controller: navigator.serviceWorker.controller?.scriptURL ?? null,
  caches: await caches.keys(),
}));
log("sw-ready", swInfo);
log("sw-after-reload", control);

// Chrome's own manifest parser is the authority on installability.
const cdp = await mobile.newCDPSession(page);
const appManifest = await cdp.send("Page.getAppManifest");
log("chrome-manifest", { url: appManifest.url, errors: appManifest.errors, parsed: appManifest.parsed ? "yes" : "no" });

/* ── 4. install prompt (Chromium path) ────────────────────────────────────── */
/**
 * Chromium only fires `beforeinstallprompt` for "engaged" users, which a fresh
 * headless profile never has — so the event is synthesised with the same shape the
 * browser uses. Everything downstream (capture, banner, wiring the native prompt)
 * is the shipped code path.
 */
const dispatchInstallPrompt = (outcome) =>
  page.evaluate((choice) => {
    window.__installPromptCalls = 0;
    const event = new Event("beforeinstallprompt");
    event.platforms = ["web"];
    event.prompt = async () => {
      window.__installPromptCalls += 1;
    };
    event.userChoice = Promise.resolve({ outcome: choice, platform: "web" });
    window.dispatchEvent(event);
  }, outcome);

const banner = page.locator('[data-testid="install-prompt"]');
const bannerInstall = page.locator('[data-testid="install-prompt"] button:has-text("Install")');
const bannerNotNow = page.locator('[data-testid="install-prompt"] button:has-text("Not now")');
let bannerVisible = false;

await dispatchInstallPrompt("accepted");
await banner.waitFor({ state: "visible", timeout: 5000 });
bannerVisible = await banner.isVisible();
log("install-banner-visible", bannerVisible);
log(
  "nav-install-button-visible-mobile",
  await page.locator('[data-testid="install-app-button"]').isVisible(),
);
await page.screenshot({ path: `${OUT}/pwa-install-prompt.png` });
log("saved", "pwa-install-prompt.png");

await bannerInstall.click();
await page.waitForTimeout(400);
const promptCalls = await page.evaluate(() => window.__installPromptCalls);
const bannerAfterAccept = await banner.count();
log("native-prompt-calls", promptCalls);
log("banner-after-accept", bannerAfterAccept);
await page.screenshot({ path: `${OUT}/pwa-install-accepted.png` });
log("saved", "pwa-install-accepted.png");

/* ── 5. "Not now" snooze ─────────────────────────────────────────────────── */
await page.reload({ waitUntil: "networkidle" });
await dispatchInstallPrompt("dismissed");
await banner.waitFor({ state: "visible", timeout: 5000 });
await bannerNotNow.click();
await page.waitForTimeout(300);
const snoozed = await banner.count();
const snoozeStored = await page.evaluate(() => localStorage.getItem("songs.pwa.install-dismissed") !== null);
log("banner-after-not-now", snoozed);
log("snooze-stored", snoozeStored);
await page.screenshot({ path: `${OUT}/pwa-install-dismissed.png` });
log("saved", "pwa-install-dismissed.png");

await page.reload({ waitUntil: "networkidle" });
await dispatchInstallPrompt("dismissed");
await page.waitForTimeout(500);
const snoozePersists = (await banner.count()) === 0;
log("snooze-survives-reload", snoozePersists);
await page.evaluate(() => localStorage.removeItem("songs.pwa.install-dismissed"));
const navInstallVisibleOnMobile = await page.locator('[data-testid="install-app-button"]').isVisible();

/* ── 5b. desktop entry point in the app bar ───────────────────────────────── */
const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const desktopPage = await desktop.newPage();
await desktopPage.goto(`${BASE}/`, { waitUntil: "networkidle" });
await desktopPage.evaluate(() => {
  window.__installPromptCalls = 0;
  const event = new Event("beforeinstallprompt");
  event.platforms = ["web"];
  event.prompt = async () => {
    window.__installPromptCalls += 1;
  };
  event.userChoice = Promise.resolve({ outcome: "dismissed", platform: "web" });
  window.dispatchEvent(event);
});
const desktopNavButton = desktopPage.locator('[data-testid="install-app-button"]');
await desktopNavButton.waitFor({ state: "visible", timeout: 5000 });
const desktopNavVisible = await desktopNavButton.isVisible();
log("desktop-nav-install-button-visible", desktopNavVisible);
await desktopPage.screenshot({ path: `${OUT}/pwa-install-desktop.png` });
log("saved", "pwa-install-desktop.png");
await desktopNavButton.click();
await desktopPage.waitForTimeout(300);
const desktopPromptCalls = await desktopPage.evaluate(() => window.__installPromptCalls);
log("desktop-nav-install-prompts", desktopPromptCalls);
await desktop.close();

/* ── 6. iOS Safari has no prompt API → manual instructions ────────────────── */
const ios = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: IPHONE_UA,
});
const iosPage = await ios.newPage();
await iosPage.goto(`${BASE}/`, { waitUntil: "networkidle" });
const iosBanner = iosPage.locator('[data-testid="install-prompt"]');
await iosBanner.waitFor({ state: "visible", timeout: 5000 });
const iosText = (await iosBanner.innerText()).replace(/\s+/g, " ");
log("ios-banner-text", iosText);
log("ios-beforeinstallprompt-supported", await iosPage.evaluate(() => "onbeforeinstallprompt" in window));
await iosPage.screenshot({ path: `${OUT}/pwa-install-ios.png` });
log("saved", "pwa-install-ios.png");
await ios.close();

/* ── 7. offline behaviour ─────────────────────────────────────────────────── */
await page.goto(`${BASE}/`, { waitUntil: "networkidle" }); // make sure "/" is in the runtime cache
await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 10000 });
log("online-before-offline", await page.evaluate(() => navigator.onLine));
await mobile.setOffline(true);
await page.waitForTimeout(400);
log("online-after-offline", await page.evaluate(() => navigator.onLine));

const offlineBanner = page.locator('[data-testid="offline-banner"]');
await offlineBanner.waitFor({ state: "visible", timeout: 10000 });
const offlineBannerVisible = await offlineBanner.isVisible();
log("offline-banner-visible", offlineBannerVisible);
await page.screenshot({ path: `${OUT}/pwa-offline-banner.png` });
log("saved", "pwa-offline-banner.png");

// A previously visited URL replays from the runtime cache. `x-songs-cache` proves the
// document never touched the network, which matters because Chromium's own
// `navigator.onLine` is unreliable for documents served out of a worker cache.
log("online-pre-reload", await page.evaluate(() => navigator.onLine));
const reloadResponse = await page
  .reload({ waitUntil: "domcontentloaded" })
  .catch((error) => {
    log("offline-reload-error", String(error).slice(0, 140));
    return null;
  });
const reloadSource = reloadResponse?.headers()["x-songs-cache"] ?? "network";
await page.waitForTimeout(1500);
log("offline-reload-source", reloadSource);
log(
  "after-offline-reload",
  await page.evaluate(() => ({
    url: location.href,
    banner: Boolean(document.querySelector('[data-testid="offline-banner"]')),
    shell: Boolean(document.querySelector('[data-testid="offline-shell"]')),
    online: navigator.onLine,
    text: document.body.innerText.slice(0, 70).replace(/\s+/g, " "),
  })),
);
const cachedPage = {
  offlineShell: await page.locator('[data-testid="offline-shell"]').count(),
  hasNav: (await page.locator("body").innerText()).includes("Discover"),
};
log("offline-reload-of-cached-page", cachedPage);
await page.screenshot({ path: `${OUT}/pwa-offline-cached-page.png` });
log("saved", "pwa-offline-cached-page.png");

// A URL that was never visited is redirected to the precached offline shell.
const shellResponse = await page
  .goto(`${BASE}/terms`, { waitUntil: "domcontentloaded" })
  .catch(() => null);
const shellSource = shellResponse?.headers()["x-songs-cache"] ?? "network";
await page.locator('[data-testid="offline-shell"]').waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
const offlineShellShown = (await page.locator('[data-testid="offline-shell"]').count()) === 1;
log("offline-unvisited-route", { offlineShell: offlineShellShown, source: shellSource, url: page.url() });
await page.screenshot({ path: `${OUT}/pwa-offline-shell.png` });
log("saved", "pwa-offline-shell.png");
await mobile.setOffline(false);

/* ── 8. installed (standalone) shell ──────────────────────────────────────── */
const standalone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
/**
 * Blink cannot emulate `display-mode` through Emulation.setEmulatedMedia, so the
 * JavaScript branch is exercised by reporting `standalone` from matchMedia before
 * the app boots; the CSS branch is proven below by reading the compiled rule.
 */
await standalone.addInitScript(() => {
  const original = window.matchMedia.bind(window);
  window.matchMedia = (query) => {
    const list = original(query);
    if (!query.includes("display-mode: standalone")) return list;
    return {
      matches: true,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    };
  };
});
const standalonePage = await standalone.newPage();
await standalonePage.goto(`${BASE}/`, { waitUntil: "networkidle" });
const standaloneInfo = await standalonePage.evaluate(() => ({
  mediaMatches: window.matchMedia("(display-mode: standalone)").matches,
  attribute: document.documentElement.dataset.displayMode ?? null,
  installBanner: document.querySelector('[data-testid="install-prompt"]') !== null,
  safeBottom: getComputedStyle(document.documentElement).getPropertyValue("--safe-b").trim(),
}));
log("standalone-shell", standaloneInfo);

const standaloneCss = await standalonePage.evaluate(() => {
  const found = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      const text = (rule.cssText ?? "").replace(/\s+/g, " ");
      if (text.includes("display-mode: standalone")) found.push(text.slice(0, 500));
    }
  }
  return found;
});
log("standalone-css-rules", standaloneCss);
await standalonePage.screenshot({ path: `${OUT}/pwa-standalone-shell.png` });
log("saved", "pwa-standalone-shell.png");
await standalone.close();

/* ── 9. icon contact sheet (any / maskable / iOS masks) ───────────────────── */
const sheet = await browser.newContext({ viewport: { width: 820, height: 250 }, deviceScaleFactor: 2 });
const sheetPage = await sheet.newPage();
const sheetIcons = [
  ["icon-192.png", "192 · any", "20%"],
  ["icon-512.png", "512 · any", "20%"],
  ["maskable-512.png", "512 · maskable", "50%"],
  ["apple-touch-icon.png", "180 · apple", "20%"],
];
await sheetPage.setContent(
  `<body style="margin:0;background:#0a0a0d;color:#c9c9d6;font:13px ui-monospace,monospace;display:flex;gap:28px;align-items:center;padding:26px 30px">
    ${sheetIcons
      .map(
        ([file, label, radius]) =>
          `<figure style="margin:0;text-align:center"><img src="${BASE}/icons/${file}" width="140" height="140" style="border-radius:${radius}"><figcaption style="margin-top:10px">${label}</figcaption></figure>`,
      )
      .join("")}
  </body>`,
);
await sheetPage.waitForTimeout(400);
await sheetPage.screenshot({ path: `${OUT}/pwa-manifest-icons.png` });
log("saved", "pwa-manifest-icons.png");
await sheet.close();
await browser.close();

/* ── 10. verdict ──────────────────────────────────────────────────────────── */
const failures = [];
const check = (label, ok) => {
  if (!ok) failures.push(label);
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
};

console.log("\n── assertions ──");
check("manifest served with a manifest content type", manifestRes.status === 200 && manifestType.includes("manifest"));
check("manifest declares name/short_name/start_url/scope", Boolean(manifest.name && manifest.short_name && manifest.start_url && manifest.scope));
check("manifest display is standalone", manifest.display === "standalone");
check("theme + background colours match the shell", manifest.theme_color === "#0a0a0d" && manifest.background_color === "#0a0a0d");
check("192 + 512 any icons and a 512 maskable icon", manifest.icons.some((i) => i.sizes === "192x192") && manifest.icons.some((i) => i.sizes === "512x512" && i.purpose === "any") && manifest.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"));
check("every manifest icon is a PNG of the declared size", iconChecks.every((i) => i.status === 200 && i.png && i.fits));
check("manifest links to app shortcuts", Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 3);
check("document links the manifest", head.manifests.includes("/manifest.webmanifest"));
check("theme-color meta present", head.themeColor.includes("#0a0a0d"));
check("apple-touch + favicon come from the app icon conventions", (head.favicon ?? "").startsWith("/icon.png") && (head.appleTouch ?? "").startsWith("/apple-icon.png"));
check("viewport allows edge-to-edge on notched devices", (head.viewport ?? "").includes("viewport-fit=cover"));
check("sw.js is revalidated every load and scoped to the origin", swRes.status === 200 && /no-store/.test(swRes.headers.get("cache-control") ?? "") && swRes.headers.get("service-worker-allowed") === "/");
check("offline document is prerendered and precacheable", offlineRes.status === 200 && offlineHtml.includes("offline-shell"));
check("service worker activates and controls the page", swInfo.state === "activated" && Boolean(control.controller));
check("service worker owns versioned caches", control.caches.some((c) => c.startsWith("songs-")));
check("chrome's manifest parser reports no errors", appManifest.errors.length === 0 && Boolean(appManifest.parsed));
check("install banner appears when a prompt is available", bannerVisible);
check("nav install shortcut stays off small screens", navInstallVisibleOnMobile === false);
check("desktop app-bar install shortcut works", desktopNavVisible && desktopPromptCalls === 1);
check("clicking Install triggers the native prompt", promptCalls === 1);
check("banner hides once installed", bannerAfterAccept === 0);
check("'Not now' persists the snooze", snoozeStored && snoozePersists);
check("iOS gets manual Add-to-Home-Screen guidance", iosText.includes("Add to Home Screen"));
check("offline banner appears as soon as the network drops", offlineBannerVisible);
check("visited page replays from the worker cache offline", reloadSource === "sw-cache" && cachedPage.hasNav);
check("unvisited route is redirected to the precached offline shell", offlineShellShown && shellSource === "sw-cache" && page.url().endsWith("/offline"));
check("standalone mode is detected and suppresses install UI", standaloneInfo.mediaMatches && standaloneInfo.attribute === "standalone" && standaloneInfo.installBanner === false);
check("standalone CSS tightens the shell", standaloneCss.some((t) => t.includes("overscroll-behavior-y")) && standaloneCss.some((t) => t.includes("user-select")));

console.log(`\n${failures.length === 0 ? "ALL CHECKS PASSED" : `${failures.length} CHECK(S) FAILED: ${failures.join(", ")}`}`);
process.exit(failures.length === 0 ? 0 : 1);
