import { expect, test } from "@playwright/test";

const SEEDED_EMAIL = "scoutmaster@example.invalid";
const SEEDED_PASSWORD = "AdminPasswordTest123!";

test.describe("tenant routing (subdomain)", () => {
  test("subdomain rewrites to /o/<slug>", async ({ page }) => {
    const res = await page.goto("http://troop100.localhost:3000/");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: /Troop 100/ })).toBeVisible();
  });

  test("unknown subdomain renders not-found", async ({ page }) => {
    const res = await page.goto("http://troop999.localhost:3000/", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(404);
  });

  test("admin redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("http://troop100.localhost:3000/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("admin allows leader and shows overview", async ({ page }) => {
    await page.goto("http://troop100.localhost:3000/login");
    await page.getByLabel("Email").fill(SEEDED_EMAIL);
    await page.getByLabel("Password").fill(SEEDED_PASSWORD);
    await page.waitForTimeout(1700);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("**/");
    await page.goto("http://troop100.localhost:3000/admin");
    // The redesigned overview h1 is the day-of-week greeting; the
    // always-present h2 is more stable to anchor on.
    await expect(
      page.getByRole("heading", { name: /coming up/i }),
    ).toBeVisible();
  });

  test("admin announcements form posts an announcement", async ({ page }) => {
    await page.goto("http://troop100.localhost:3000/login");
    await page.getByLabel("Email").fill(SEEDED_EMAIL);
    await page.getByLabel("Password").fill(SEEDED_PASSWORD);
    await page.waitForTimeout(1700);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("**/");
    await page.goto("http://troop100.localhost:3000/admin/announcements");
    const title = `E2E announcement ${Date.now()}`;
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Body").fill("This is the announcement body.");
    await page.getByRole("button", { name: /post announcement/i }).click();
    await expect(page.getByText(title).first()).toBeVisible();
  });
});
