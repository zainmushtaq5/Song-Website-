/**
 * Visual QA: capture home page at 375 / 768 / 1440 widths and check for
 * horizontal overflow at each size. Screenshots land in screenshots/.
 * Run: node e2e/screenshot.mjs [frontend-url]
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = fileURLToPath(new URL("./screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1440", width: 1440, height: 900 },
];

const browser = await chromium.launch();
let allClean = true;

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  checkOverflow(vp.name, overflow);

  await page.screenshot({ path: `${OUT}${vp.name}.png`, fullPage: true });
  console.log(`screenshot: screenshots/${vp.name}.png (overflow: ${overflow}px)`);
  if (overflow > 0) allClean = false;
  await page.close();
}

// Hover state screenshot of a song card at laptop size
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
const firstCard = page.locator("article").first();
if ((await firstCard.count()) > 0) {
  await firstCard.hover();
  await page.waitForTimeout(450);
  await firstCard.screenshot({ path: `${OUT}card-hover.png` });
  console.log("screenshot: screenshots/card-hover.png");
}
await browser.close();

function checkOverflow(name, px) {
  console.log(`  overflow ${name}: ${px}px ${px === 0 ? "OK" : "!! OVERFLOW !!"}`);
}
console.log(`\n${allClean ? "NO OVERFLOW at any breakpoint" : "OVERFLOW DETECTED — fix needed"}`);
