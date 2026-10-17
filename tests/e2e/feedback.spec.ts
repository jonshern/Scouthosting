// Public feedback / roadmap surface.

import { expect, test, type Page } from "@playwright/test";
import { showPasswordSignIn } from "./helpers/flows";

const EMAIL = "scoutmaster@example.invalid";
const PASSWORD = "AdminPasswordTest123!";
const TENANT = "http://troop100.localhost:3000";

async function signInTenant(page: Page) {
  await page.goto(`${TENANT}/login`);
  await showPasswordSignIn(page);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/);
}

test.describe("feedback / public roadmap", () => {
  test("anonymous visitors see the list + a sign-in prompt", async ({ page }) => {
    await page.goto(`${TENANT}/feedback`);
    await expect(
      page.getByRole("heading", { level: 1, name: /^feedback$/i }),
    ).toBeVisible();
    // Anonymous: no submit form, only the prompt linking to /login.
    await expect(
      page.getByRole("link", { name: /^sign in$/i }),
    ).toBeVisible();
  });

  test("signed-in user can submit feedback and see it appear", async ({ page }) => {
    await signInTenant(page);
    await page.goto(`${TENANT}/feedback`);
    const title = `E2E feedback ${Date.now()}`;
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Description").fill("Something to fix or build.");
    await page.getByRole("button", { name: /^submit$/i }).click();
    await page.waitForTimeout(500);
    await page.goto(`${TENANT}/feedback`);
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
  });
});
