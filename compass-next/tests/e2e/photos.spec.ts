import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";

const SEEDED_EMAIL = "scoutmaster@example.invalid";
const SEEDED_PASSWORD = "AdminPasswordTest123!";

async function login(page: import("@playwright/test").Page) {
  await page.goto("http://troop100.localhost:3000/login");
  await page.getByLabel("Email").fill(SEEDED_EMAIL);
  await page.getByLabel("Password").fill(SEEDED_PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/");
}

// 1x1 PNG fixture; small enough to inline as base64
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64"
);

let fixturePath = "";

test.beforeAll(async () => {
  fixturePath = path.resolve(process.cwd(), "test-results/fixture.png");
  await fs.mkdir(path.dirname(fixturePath), { recursive: true });
  await fs.writeFile(fixturePath, PNG_1x1);
});

test.describe("photos", () => {
  test("admin creates an album and uploads a photo, parent sees it", async ({ page }) => {
    await login(page);
    const albumSlug = `e2e-${Date.now()}`;

    await page.goto("http://troop100.localhost:3000/admin/photos");
    await page.getByLabel("Album title").fill("E2E album");
    await page.getByLabel("URL slug").fill(albumSlug);
    await page.getByRole("button", { name: /create album/i }).click();
    // Wait for the redirect to land us back on the album list with the
    // new album visible (the form action redirects, but waiting on the
    // URL alone is racy — we land here whether or not the action
    // succeeded).
    await page.waitForURL((url) => url.pathname.endsWith("/admin/photos"));
    await expect(page.locator(`a[href$="/photos/${albumSlug}"]`).first()).toBeVisible();

    // Open the album admin page
    await page.goto(`http://troop100.localhost:3000/admin/photos/${albumSlug}`);
    await page.setInputFiles("#file", fixturePath);
    await page.getByRole("button", { name: /upload photos/i }).click();
    await expect(page.getByRole("status")).toContainText(/uploaded/i);

    // Public-facing album page renders the photo grid
    await page.goto(`http://troop100.localhost:3000/photos/${albumSlug}`);
    const imgs = page.locator("img");
    await expect(imgs.first()).toBeVisible();
  });

  test("uploads route 404s for nonexistent photo", async ({ request }) => {
    const res = await request.get("http://troop100.localhost:3000/uploads/orgs/none/photos/nope.jpg");
    expect(res.status()).toBe(404);
  });

  test("members-only album is hidden from anonymous public listing", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Sign in to create the album
    await login(page);
    const albumSlug = `members-only-${Date.now()}`;
    await page.goto("http://troop100.localhost:3000/admin/photos");
    await page.getByLabel("Album title").fill("Members album");
    await page.getByLabel("URL slug").fill(albumSlug);
    await page.locator("#visibility").selectOption("members");
    await page.getByRole("button", { name: /create album/i }).click();
    await page.waitForURL("**/admin/photos");

    // Anonymous browsing: shouldn't see the members-only album in /photos
    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto("http://troop100.localhost:3000/photos");
    await expect(anonPage.getByText("Members album")).toHaveCount(0);
    await anon.close();
    await ctx.close();
  });
});
