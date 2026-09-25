/**
 * Visual evidence for Phase 4.1 recommendations: homepage "Recommended For You"
 * section with a logged-in listener (personalized picks + artist chips).
 * Run: node e2e/rec-screens.mjs [frontend-url] [backend-url]
 */
import { chromium } from "playwright";

const FRONTEND = process.argv[2] ?? "http://localhost:3001";
const BACKEND = process.argv[3] ?? "http://localhost:8000";
const OUT = "e2e/screenshots";

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
  return res.json();
}

const listeners = await api("/api/auth/login", {
  data: { email: "listener-121595@smoketest.example.com", password: "password123" },
}).catch(() => null);
const token = listeners?.access_token;
if (!token) throw new Error("seeded listener not found; run scripts/seed_demo.py first");

const me = await api("/api/auth/me", { token });
const session = { state: { user: me, tokens: { access_token: token, refresh_token: token } }, version: 0 };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript((s) => localStorage.setItem("songs-auth", JSON.stringify(s)), session);
const page = await context.newPage();
await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => document.body.innerText.includes("Recommended For You"), { timeout: 15000 });
await page.screenshot({ path: `${OUT}/rec-home-loggedin.png`, fullPage: false });
console.log("saved: rec-home-loggedin.png");

// anon variant: "You Might Like" (fresh context without a session)
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page2 = await ctx2.newPage();
await page2.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
await page2.waitForFunction(() => document.body.innerText.includes("You Might Like"), { timeout: 15000 });
await page2.screenshot({ path: `${OUT}/rec-home-anon.png`, fullPage: false });
console.log("saved: rec-home-anon.png");

await browser.close();
console.log("done");