import { chromium } from "playwright";

async function checkSearch() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("http://localhost:3000/search", { waitUntil: "networkidle" });
  const input = page.locator('input[type="search"]');
  await input.fill("Bollywood");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "e2e/screenshots/bollywood_search_live.png" });
  console.log("Screenshot successfully saved to e2e/screenshots/bollywood_search_live.png");
  await browser.close();
}

checkSearch();
