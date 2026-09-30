import { chromium } from "playwright";

async function snap() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "e2e/screenshots/bollywood_catalog_home.png", fullPage: true });

  await page.goto("http://localhost:3000/search", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const input = page.locator('input[type="search"]');
  await input.fill("Arijit");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "e2e/screenshots/bollywood_catalog_search_arijit.png" });

  await browser.close();
  console.log("Catalog screenshots captured successfully");
}

snap();
