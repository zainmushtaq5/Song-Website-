import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

async function uploadBollywoodSample() {
  console.log("=== STARTING BOLLYWOOD SONG SAMPLE UPLOAD ===");

  const audioPath = path.resolve("bollywood_sample_track.mp3");
  const coverPath = path.resolve("bollywood_thumbnail.jpg");

  if (!fs.existsSync(audioPath)) {
    throw new Error("Audio file not found: " + audioPath);
  }
  if (!fs.existsSync(coverPath)) {
    throw new Error("Cover file not found: " + coverPath);
  }
  console.log(`Files found:\n  Audio: ${audioPath} (${fs.statSync(audioPath).size} bytes)\n  Cover: ${coverPath} (${fs.statSync(coverPath).size} bytes)`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Login
    console.log("Logging in as admin...");
    await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
    await page.locator('input[type="email"]').fill("admin-smoke@smoketest.example.com");
    await page.locator('input[type="password"]').fill("password123");
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("http://localhost:3000/", { timeout: 15000 });
    await page.waitForLoadState("networkidle");
    console.log("Login successful!");

    // 2. Go to /upload
    console.log("Navigating to upload page...");
    await page.goto("http://localhost:3000/upload", { waitUntil: "networkidle" });

    // 3. Fill form
    const songTitle = "Dhadkan Ka Safar (Romantic Bollywood Mix)";
    const description = "Cinematic Bollywood romantic melody featuring traditional Indian strings, acoustic rhythm, and grand orchestral arrangement.";
    const genre = "Bollywood Romantic";

    await page.getByLabel("Title", { exact: false }).fill(songTitle);
    await page.getByLabel("Description (optional)", { exact: false }).fill(description);
    await page.getByLabel("Genre (optional)", { exact: false }).fill(genre);

    console.log("Attaching audio and cover thumbnail...");
    await page.locator("input#audio-input").setInputFiles(audioPath);
    await page.locator("input#cover-input").setInputFiles(coverPath);

    // Optional: allow download
    const downloadCheckbox = page.locator('input[type="checkbox"]');
    if ((await downloadCheckbox.count()) > 0) {
      await downloadCheckbox.check();
    }

    await page.screenshot({ path: "e2e/screenshots/bollywood_form_filled.png" });

    // 4. Submit
    console.log("Submitting song upload...");
    const submitBtn = page.getByRole("button", { name: /Submit for review/i });
    await submitBtn.click();

    // Wait for submission response
    await page.waitForTimeout(5000);
    await page.screenshot({ path: "e2e/screenshots/bollywood_uploaded.png" });

    const inMyUploads = await page.getByText(songTitle).count();
    console.log(`Song appears in 'My uploads': ${inMyUploads > 0}`);

    // 5. Approve in Admin Queue so it appears in Discover & public feed
    console.log("Approving song in Admin queue for public discoverability...");
    await page.goto("http://localhost:3000/admin", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    const songRow = page.locator('li[data-testid="admin-song-row"]').filter({ hasText: songTitle }).first();
    if ((await songRow.count()) > 0) {
      const approveBtn = songRow.getByRole("button", { name: "Approve" });
      if ((await approveBtn.count()) > 0) {
        await approveBtn.click();
        console.log("Clicked Approve on song!");
        await page.waitForTimeout(2000);
      }
    } else {
      console.log("Song row not in pending list or already approved");
    }

    // 6. Check Home / Discover
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "e2e/screenshots/bollywood_on_homepage.png" });
    console.log("Final screenshot saved at e2e/screenshots/bollywood_on_homepage.png");

    console.log("=== BOLLYWOOD SAMPLE UPLOAD COMPLETED SUCCESSFULLY ===");
  } catch (err) {
    console.error("Upload error:", err);
    await page.screenshot({ path: "e2e/screenshots/bollywood_error.png" }).catch(() => {});
  } finally {
    await browser.close();
  }
}

uploadBollywoodSample();
