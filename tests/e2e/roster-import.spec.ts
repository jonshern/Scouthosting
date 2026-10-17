// Roster import preview + commit.

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

const SAMPLE_CSV = `firstName,lastName,email,patrol,position,isYouth
Imported,One,imported.one+${Date.now()}@example.invalid,Eagles,Patrol Leader,true
Imported,Two,imported.two+${Date.now()}@example.invalid,Eagles,,true
`;

test.describe("roster import", () => {
  test("preview shows creates count for fresh CSV", async ({ page }) => {
    await signInTenant(page);
    await page.goto(`${TENANT}/admin/members/import`);
    await expect(page.getByRole("heading", { name: /roster import/i })).toBeVisible();

    await page
      .locator("textarea[name=text]")
      .fill(SAMPLE_CSV);
    await page.getByRole("button", { name: /^preview$/i }).click();

    await expect(page.getByText(/2 new members/i)).toBeVisible({ timeout: 10_000 });
  });

  test("rejects empty input", async ({ page }) => {
    await signInTenant(page);
    await page.goto(`${TENANT}/admin/members/import`);
    await page.getByRole("button", { name: /^preview$/i }).click();
    await expect(page.getByText(/upload a file or paste/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
