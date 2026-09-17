/**
 * E2E: stale-session login flow.
 * 1. Pre-seed an INVALID session in localStorage (simulates leftover tokens
 *    from a wiped DB).
 * 2. Load /login — assert the form renders with NO "Not authenticated" error.
 * 3. Fill correct credentials, click "Log in".
 * 4. Assert POST /api/auth/login -> 200, redirect to "/", navbar shows the user.
 *
 * Run: node e2e/login-test.mjs [base-url]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "admin-smoke@smoketest.example.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "password123";

const staleSession = {
  state: {
    user: { id: "00000000-0000-0000-0000-000000000000", email: "ghost@example.com", username: "ghost", role: "USER", avatar_url: null },
    tokens: { access_token: "stale-access-token", refresh_token: "stale-refresh-token" },
  },
  version: 0,
};

const results = [];
function check(label, cond, extra = "") {
  results.push({ label, pass: cond, extra });
  console.log(`[${cond ? "PASS" : "FAIL"}] ${label}${cond ? "" : ` -> ${extra}`}`);
}

const network = [];
const browser = await chromium.launch();
const context = await browser.newContext();
await context.addInitScript((session) => {
  localStorage.setItem("songs-auth", JSON.stringify(session));
}, staleSession);

const page = await context.newPage();
page.on("response", (resp) => {
  const url = resp.url();
  if (url.includes("/api/auth/login") || url.includes("/api/auth/me")) {
    network.push(`${resp.request().method()} ${new URL(url).pathname} -> ${resp.status()}`);
  }
});

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });

// Form must be usable — no persistent error from the stale session
const bodyText = await page.locator("body").innerText();
check("form visible without stale-session error", !bodyText.includes("Not authenticated"), bodyText.slice(0, 120));
check("email field present", await page.locator("input[type=email]").count() === 1);
check("password field present", await page.locator("input[type=password]").count() === 1);
check("submit button present", (await page.getByRole("button", { name: "Log in" }).count()) >= 1);

// Fill and submit
await page.locator("input[type=email]").fill(EMAIL);
await page.locator("input[type=password]").fill(PASSWORD);
await page.getByRole("button", { name: "Log in" }).click();

// Wait for redirect to home after successful login
try {
  await page.waitForURL(`${BASE}/`, { timeout: 10000 });
  check("redirected to / after login", true);
} catch {
  check("redirected to / after login", false, `still at ${page.url()}`);
}

await page.waitForLoadState("networkidle");

// Wait (don't race) for the logged-in username to render in the navbar
let userVisible = true;
try {
  await page.getByText("smoke_admin").first().waitFor({ timeout: 5000 });
} catch {
  userVisible = false;
}
check("navbar shows logged-in user", userVisible, (await page.locator("body").innerText()).slice(0, 200));
check("login button gone", !(await page.getByRole("button", { name: "Log in", exact: true }).count()));

// Network assertions
const loginCall = network.find((n) => n.startsWith("POST /api/auth/login"));
check("POST /api/auth/login returned 200", !!loginCall && loginCall.includes("-> 200"), network.join(" | "));

console.log("\nNetwork calls observed:");
for (const n of network) console.log(`  ${n}`);

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\nE2E RESULT: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
