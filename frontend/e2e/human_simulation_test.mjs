import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

async function run() {
  const report = [];
  const log = (msg) => {
    console.log(msg);
    report.push(msg);
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    log("=== STEP 1: Navigate to Home (http://localhost:3000) ===");
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    log("Page Title: " + (await page.title()));
    await page.screenshot({ path: "e2e/screenshots/human_step1_home.png" });

    log("\n=== STEP 2: Navigate to Login Page ===");
    const loginLink = page.getByRole("link", { name: "Log in" }).first();
    await loginLink.waitFor({ state: "visible", timeout: 10000 });
    await loginLink.click();
    log("Clicked 'Log in' link in navbar");
    await page.waitForURL("**/login", { timeout: 10000 });
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "e2e/screenshots/human_step2_login_page.png" });

    log("\n=== STEP 3: Enter Credentials and Submit Login ===");
    await page.locator('input[type="email"]').waitFor({ state: "visible", timeout: 10000 });
    await page.locator('input[type="email"]').fill("admin-smoke@smoketest.example.com");
    await page.locator('input[type="password"]').fill("password123");
    await page.screenshot({ path: "e2e/screenshots/human_step3_filled_form.png" });

    await page.getByRole("button", { name: "Log in" }).click();
    log("Clicked submit button");

    await page.waitForURL("http://localhost:3000/", { timeout: 10000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    log("Redirected to home successfully");
    await page.screenshot({ path: "e2e/screenshots/human_step4_logged_in.png" });

    const userProfileEl = page.locator('a[aria-label*="Profile:"]');
    const hasUserProfile = (await userProfileEl.count()) > 0;
    log("Profile link visible in navbar: " + hasUserProfile);

    log("\n=== STEP 4: Test Logout ===");
    const logoutBtn = page.getByRole("button", { name: "Log out" });
    if ((await logoutBtn.count()) > 0) {
      await logoutBtn.click();
      log("Clicked 'Log out' button");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
      const loginBtnAfterLogout = page.getByRole("link", { name: "Log in" }).first();
      log("Login button visible after logout: " + ((await loginBtnAfterLogout.count()) > 0));
      await page.screenshot({ path: "e2e/screenshots/human_step5_logged_out.png" });
    } else {
      log("Logout button not found");
    }

    log("\n=== STEP 5: Log Back In to Test Add & Delete Song ===");
    await page.goto("http://localhost:3000/login");
    await page.locator('input[type="email"]').fill("admin-smoke@smoketest.example.com");
    await page.locator('input[type="password"]').fill("password123");
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("http://localhost:3000/", { timeout: 10000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    log("Logged back in as smoke_admin");

    log("\n=== STEP 6: Add Song (Upload Page) ===");
    const uploadLink = page.getByRole("link", { name: "Upload" }).first();
    if ((await uploadLink.count()) > 0) {
      await uploadLink.click();
      log("Clicked Upload link in navbar");
    } else {
      await page.goto("http://localhost:3000/upload");
    }
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "e2e/screenshots/human_step6_upload_page.png" });

    const songTitle = "Midnight Echoes " + Date.now().toString().slice(-4);
    await page.locator("input#audio-input").setInputFiles(path.resolve("test_audio.wav"));
    await page.locator("input#cover-input").setInputFiles(path.resolve("test_cover.png"));
    await page.getByLabel("Title", { exact: false }).fill(songTitle);
    await page.getByLabel("Genre", { exact: false }).fill("Synthwave");
    await page.screenshot({ path: "e2e/screenshots/human_step7_upload_filled.png" });

    const submitUploadBtn = page.getByRole("button", { name: /Submit for review/i });
    await submitUploadBtn.click();
    log("Submitted song: " + songTitle);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "e2e/screenshots/human_step8_uploaded_result.png" });

    const uploadedSongItem = page.getByText(songTitle);
    const uploadedVisible = (await uploadedSongItem.count()) > 0;
    log("Song appears in My Uploads list: " + uploadedVisible);

    log("\n=== STEP 7: Delete Song in Admin Management ===");
    await page.goto("http://localhost:3000/admin");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "e2e/screenshots/human_step9_admin_page.png" });

    let songRow = page.locator('li[data-testid="admin-song-row"]').filter({ hasText: songTitle }).first();
    if ((await songRow.count()) === 0) {
      log("Song not in current filter view, switching to All songs filter");
      const allFilter = page.locator('button[data-testid="admin-filter-ALL"]');
      if ((await allFilter.count()) > 0) {
        await allFilter.click();
        await page.waitForTimeout(1000);
        songRow = page.locator('li[data-testid="admin-song-row"]').filter({ hasText: songTitle }).first();
      }
    }

    if ((await songRow.count()) > 0) {
      log("Found song row in Admin: " + songTitle);
      const deleteBtn = songRow.locator('button[data-testid="admin-delete"]');
      await deleteBtn.click();
      log("Clicked Delete button on song row");
      await page.waitForTimeout(500);
      await page.screenshot({ path: "e2e/screenshots/human_step10_delete_confirm.png" });

      const confirmContainer = songRow.locator('[data-testid="admin-delete-confirm"]');
      const confirmBtn = confirmContainer.locator('button[data-testid="admin-delete-submit"]');
      await confirmBtn.click();
      log("Confirmed deletion of song ('Delete song')");
      await page.waitForTimeout(2000);
      await page.screenshot({ path: "e2e/screenshots/human_step11_after_delete.png" });

      const stillThere = await page
        .locator('li[data-testid="admin-song-row"]')
        .filter({ hasText: songTitle })
        .count();
      log("Song still present in admin list: " + (stillThere > 0 ? "YES (failed)" : "NO (successfully deleted!)"));
    } else {
      log("Song row not found in Admin management list");
    }

    log("\n=== ALL TEST STEPS FINISHED ===");
  } catch (err) {
    log("\n[ERROR encountered]: " + (err.stack || err.message));
    await page.screenshot({ path: "e2e/screenshots/human_error.png" }).catch(() => {});
  } finally {
    await browser.close();
    fs.writeFileSync("e2e/human_test_report.txt", report.join("\n"));
  }
}

run();
