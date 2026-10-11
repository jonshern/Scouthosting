// Demo-flow walkthrough: the exact path a viewer follows in a live
// product demo. Every step has its own test so a regression on the
// landing page doesn't cascade and stop us from learning whether
// login works.
//
// 1. Marketing landing renders
// 2. Login page reachable + form present
// 3. Login as seeded scoutmaster → admin dashboard
// 4. Admin sub-pages all render (smoke)
// 5. Switch to tenant subdomain → public unit site renders
// 6. Logout flushes the session
// 7. Signup creates a fresh account

import { expect, test, type Page } from "@playwright/test";

const EMAIL = "scoutmaster@example.invalid";
const PASSWORD = "AdminPasswordTest123!";
const APEX = "http://localhost:3000";
const TENANT = "http://troop100.localhost:3000";

async function signInApex(page: Page) {
  await page.goto(`${APEX}/login`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Seeded scoutmaster lands on /o/troop100/admin (single-org user).
  await page.waitForURL(/\/(admin|select-org|super-admin)/);
}

test.describe("demo flow", () => {
  test("1. apex landing page renders without errors", async ({ page }) => {
    test.setTimeout(30_000);
    const res = await page.goto(`${APEX}/`);
    expect(res?.status()).toBeLessThan(400);
    // Marketing home should have a hero h1 and a "sign in" link.
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  });

  test("2. login page renders with the form", async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto(`${APEX}/login`);
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign in/i }),
    ).toBeVisible();
  });

  test("3. apex login → admin dashboard with session cookie", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await signInApex(page);
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === "compass_session")).toBe(true);
    await expect(
      page.getByRole("heading", { level: 1 }).first(),
    ).toBeVisible();
  });

  test("4. tenant subdomain → public unit site renders", async ({ page }) => {
    test.setTimeout(30_000);
    const res = await page.goto(`${TENANT}/`);
    expect(res?.status()).toBeLessThan(400);
    await expect(
      page.getByRole("heading", { level: 1 }).first(),
    ).toBeVisible();
  });

  test("5. logout clears the session", async ({ page }) => {
    test.setTimeout(60_000);
    await signInApex(page);
    // /logout is at apex; visiting it flushes the cookie and
    // redirects to /. Just wait for the URL to no longer be /logout.
    await page.goto(`${APEX}/logout`);
    await page.waitForURL((u) => !u.pathname.startsWith("/logout"), {
      timeout: 30_000,
    });
    const cookies = await page.context().cookies();
    const session = cookies.find((c) => c.name === "compass_session");
    // After logout the cookie is either missing or has empty value /
    // expired Max-Age. Any of those is "cleared".
    if (session) {
      expect(session.value === "" || (session.expires ?? 0) < Date.now() / 1000)
        .toBe(true);
    }
  });

  test("6. signup creates a fresh account end-to-end", async ({ page }) => {
    test.setTimeout(60_000);
    const email = `demo+${Date.now()}@example.invalid`;
    await page.goto(`${APEX}/signup`);
    await page.getByLabel("Your name").fill("Demo Viewer");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("CorrectHorseBatteryStaple!");
    await page.getByLabel(/18 or older/).check();
    await page.waitForTimeout(1700);
    await page.getByRole("button", { name: /create account/i }).click();
    // A brand-new account with no org membership lands on
    // /account/profile.
    await page.waitForURL(/\/(admin|account)/);
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === "compass_session")).toBe(true);
  });
});
