/**
 * Visual evidence for Phase 4.2 advanced motion:
 * 1. scroll-triggered stagger mid-animation (Why platform cards at different opacities)
 * 2. settled state
 * 3. player bar spring slide-in mid-animation after clicking play
 * Run: node e2e/motion-screens.mjs [frontend-url] [backend-url]
 */
import { chromium } from "playwright";

const FRONTEND = process.argv[2] ?? "http://localhost:3001";
const BACKEND = process.argv[3] ?? "http://localhost:8000";
const OUT = "e2e/screenshots";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });

// 1) mid-stagger capture: scroll to the "Why this platform" section, grab a frame
//    while cards are still animating in
await page.evaluate(() => {
  document.querySelector("#recommended")?.scrollIntoView({ behavior: "instant" });
});
await page.waitForTimeout(400);
await page.evaluate(() => {
  const el = [...document.querySelectorAll("h2")].find((h) => h.textContent?.includes("Music discovery"));
  el?.scrollIntoView({ behavior: "instant", block: "start" });
});
await page.waitForTimeout(120); // mid-animation
await page.screenshot({ path: `${OUT}/motion-why-mid-stagger.png` });
console.log("saved: motion-why-mid-stagger.png");

await page.waitForTimeout(900); // settled
await page.screenshot({ path: `${OUT}/motion-why-settled.png` });
console.log("saved: motion-why-settled.png");

// 2) how-it-works stagger settled
await page.evaluate(() => {
  const el = [...document.querySelectorAll("h2")].find((h) => h.textContent?.includes("How it works"));
  el?.scrollIntoView({ behavior: "instant", block: "center" });
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/motion-howitworks.png` });
console.log("saved: motion-howitworks.png");

// 3) player bar spring slide-in: click play on the first trending card
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForFunction(() => document.body.innerText.includes("Trending Now"), { timeout: 10000 });
const playButtons = page.locator('[aria-label^="Play"]').first();
await playButtons.click({ force: true });
await page.waitForTimeout(120); // mid spring
await page.screenshot({ path: `${OUT}/motion-playerbar-mid-spring.png` });
console.log("saved: motion-playerbar-mid-spring.png");
await page.waitForTimeout(800); // settled
await page.screenshot({ path: `${OUT}/motion-playerbar-settled.png` });
console.log("saved: motion-playerbar-settled.png");

// 4) Now Playing sheet: spring expansion (mid-spring + settled), then Escape to dismiss
await page.locator('[aria-label="Open now playing"]').first().click();
await page.waitForTimeout(130); // mid spring
await page.screenshot({ path: `${OUT}/motion-nowplaying-mid-spring.png` });
console.log("saved: motion-nowplaying-mid-spring.png");

await page.waitForTimeout(900); // settled
await page.screenshot({ path: `${OUT}/motion-nowplaying-settled.png` });
console.log("saved: motion-nowplaying-settled.png");

// 4b) swipe-to-dismiss: drag the panel down past the threshold
const panel = page.locator('[role="dialog"][aria-label="Now playing"]');
const box = await panel.boundingBox();
if (box) {
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 220, { steps: 12 });
  await page.mouse.up();
}
await page.waitForTimeout(600);
console.log(`swipe-dismissed: ${(await panel.count()) === 0}`);

// 4c) Escape also dismisses the dialog
await page.locator('[aria-label="Open now playing"]').first().click();
await page.waitForTimeout(400);
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
const dialogGone = (await panel.count()) === 0;
console.log(`escape-dismissed: ${dialogGone}`);

// 5) prefers-reduced-motion: content must render immediately (no hidden offsets, no spring)
const reducedContext = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: "reduce",
});
const reducedPage = await reducedContext.newPage();
await reducedPage.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
await reducedPage.evaluate(() => {
  const el = [...document.querySelectorAll("h2")].find((h) => h.textContent?.includes("Music discovery"));
  el?.scrollIntoView({ behavior: "instant", block: "start" });
});
await reducedPage.waitForTimeout(300); // no animation to wait for
await reducedPage.screenshot({ path: `${OUT}/motion-reduced-why-platform.png` });
const transformed = await reducedPage.evaluate(() => {
  const sections = [...document.querySelectorAll("#recommended, section")];
  return sections
    .flatMap((s) => [...s.children])
    .map((el) => ({
      tag: el.tagName,
      cls: String(el.className).slice(0, 48),
      transform: getComputedStyle(el).transform,
    }))
    .filter((x) => x.transform !== "none" && x.transform !== "matrix(1, 0, 0, 1, 0, 0)");
});
console.log(`saved: motion-reduced-why-platform.png`);
console.log(`transformed wrappers: ${JSON.stringify(transformed)}`);

// player + sheet must still work without motion
const reducedPlay = reducedPage.locator('[aria-label^="Play"]').first();
await reducedPlay.click({ force: true });
await reducedPage.waitForTimeout(300);
await reducedPage.locator('[aria-label="Open now playing"]').first().click();
await reducedPage.waitForTimeout(300);
await reducedPage.screenshot({ path: `${OUT}/motion-reduced-nowplaying.png` });
const reducedSheetVisible = await reducedPage
  .locator('[role="dialog"][aria-label="Now playing"]')
  .isVisible();
console.log(`saved: motion-reduced-nowplaying.png (sheet visible: ${reducedSheetVisible})`);
await reducedContext.close();

await browser.close();
console.log("done");