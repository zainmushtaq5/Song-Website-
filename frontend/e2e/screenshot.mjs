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

  if (!(await checkHowItWorks(page, vp))) allClean = false;

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

/**
 * "How it works" is three readable columns on md+ and a stacked list on mobile.
 * A nested `md:grid-cols-3` once squeezed every step into a ⅓-width column, which
 * wrapped the copy word by word and pushed the step circles into each other.
 */
async function checkHowItWorks(page, vp) {
  const circles = page.locator('[data-testid="how-step"]');
  const count = await circles.count();
  if (count !== 3) {
    console.log(`  how-it-works ${vp.name}: expected 3 steps, found ${count} !! BROKEN !!`);
    return false;
  }

  await page.evaluate(() => {
    const el = [...document.querySelectorAll("h2")].find((h) => h.textContent?.includes("How it works"));
    el?.scrollIntoView({ behavior: "instant", block: "center" });
  });
  await page.waitForTimeout(1000); // let the stagger reveal settle before measuring

  const boxes = [];
  for (let i = 0; i < count; i++) {
    const circle = circles.nth(i);
    const box = await circle.boundingBox();
    // the grid column is the circle's parent (the stagger item)
    const columnWidth = await circle.evaluate(
      (node) => node.parentElement?.getBoundingClientRect().width ?? 0,
    );
    boxes.push({ x: box.x, y: box.y, w: box.width, columnWidth });
  }
  const details = boxes
    .map((b) => `x=${Math.round(b.x)} y=${Math.round(b.y)} col=${Math.round(b.columnWidth)}`)
    .join(" | ");

  if (vp.width < 768) {
    const stacked = boxes.every((b, i) => i === 0 || b.y > boxes[i - 1].y + 60);
    const wide = boxes.every((b) => b.columnWidth >= 200);
    console.log(
      `  how-it-works ${vp.name}: stacked=${stacked} columns>=200px=${wide} ${stacked && wide ? "OK" : "!! BROKEN !!"} (${details})`,
    );
    return stacked && wide;
  }

  const oneRow = boxes.every((b) => Math.abs(b.y - boxes[0].y) <= 24);
  const noOverlap = boxes.every((b, i) => i === 0 || b.x - (boxes[i - 1].x + boxes[i - 1].w) >= 24);
  const roomy = boxes.every((b) => b.columnWidth >= 160);
  const ok = oneRow && noOverlap && roomy;
  console.log(
    `  how-it-works ${vp.name}: oneRow=${oneRow} noOverlap=${noOverlap} columns>=160px=${roomy} ${ok ? "OK" : "!! BROKEN !!"} (${details})`,
  );
  return ok;
}

console.log(
  `\n${allClean ? "LAYOUT CLEAN: no overflow, how-it-works intact at every breakpoint" : "LAYOUT PROBLEM DETECTED — see the !! markers above"}`,
);
process.exitCode = allClean ? 0 : 1;
