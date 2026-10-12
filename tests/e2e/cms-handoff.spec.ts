// CMS handoff: Locations + Patrols admin happy path.
//
// Forms use useActionState — they don't navigate on success. We
// click submit, wait briefly for the server action, then reload to
// confirm the row landed in the grid.

import { expect, test, type Page } from "@playwright/test";
import { showPasswordSignIn } from "./helpers/flows";

const EMAIL = "scoutmaster@example.invalid";
const PASSWORD = "AdminPasswordTest123!";
const TENANT = "http://troop100.localhost:3000";

async function signIn(page: Page) {
  await page.goto(`${TENANT}/login`);
  await showPasswordSignIn(page);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/);
}

test.describe("CMS handoff: locations + patrols", () => {
  test("create location + create patrol", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page);

    const locName = `E2E Location ${Date.now()}`;
    await page.goto(`${TENANT}/admin/locations`);
    await expect(
      page.getByRole("heading", { name: /event locations/i }),
    ).toBeVisible();

    await page.locator("input[name=name]").fill(locName);
    await page.locator("select[name=type]").selectOption("Camp");
    await page.getByRole("button", { name: /create location/i }).click();
    await page.waitForTimeout(2_000);
    await page.goto(`${TENANT}/admin/locations`);
    await expect(page.getByText(locName)).toBeVisible({ timeout: 10_000 });

    const patrolName = `E2E Patrol ${Date.now()}`;
    await page.goto(`${TENANT}/admin/patrols`);
    await expect(
      page.getByRole("heading", { name: /patrols/i }),
    ).toBeVisible();

    await page.locator("input[name=name]").fill(patrolName);
    await page.locator("input[name=color]").fill("#15803d");
    await page.getByRole("button", { name: /create patrol/i }).click();
    await page.waitForTimeout(2_000);
    await page.goto(`${TENANT}/admin/patrols`);
    await expect(page.getByText(patrolName)).toBeVisible({ timeout: 10_000 });
  });
});
