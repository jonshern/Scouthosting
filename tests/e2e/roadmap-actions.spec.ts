// Focused happy-path actions for the roadmap features. Render
// smoke is already in admin-pages.spec.ts; this spec exercises one
// real write path per feature so we lock in the form contracts.
//
// We deliberately stop short of long form sequences — those time
// out the suite without adding much signal beyond what unit tests
// cover.

import { expect, test, type Page } from "@playwright/test";
import { showPasswordSignIn } from "./helpers/flows";
import { E2E_PORT } from "./helpers/ports";

const EMAIL = "scoutmaster@example.invalid";
const PASSWORD = "AdminPasswordTest123!";
const TENANT = `http://troop100.localhost:${E2E_PORT}`;

async function signIn(page: Page) {
  await page.goto(`${TENANT}/login`);
  await showPasswordSignIn(page);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/);
}

test.describe("roadmap actions", () => {
  test("equipment add → inventory list shows it", async ({ page }) => {
    test.setTimeout(60_000);
    await signIn(page);

    const equipName = `E2E Tent ${Date.now()}`;
    await page.goto(`${TENANT}/admin/equipment`);
    await expect(
      page.getByRole("heading", { name: /loan ledger/i }),
    ).toBeVisible();

    await page.locator("input[name=name]").fill(equipName);
    await page.locator("input[name=category]").fill("Shelter");
    await page.getByRole("button", { name: /add equipment/i }).click();
    await page.waitForTimeout(2_000);
    await page.goto(`${TENANT}/admin/equipment`);
    await expect(page.getByText(equipName)).toBeVisible({ timeout: 10_000 });
  });

  test("audit log filters render without throwing", async ({ page }) => {
    test.setTimeout(60_000);
    await signIn(page);

    for (const params of ["", "?action=create", "?action=update", "?entity=Member", "?q=test"]) {
      await page.goto(`${TENANT}/admin/audit${params}`);
      await expect(
        page.getByRole("heading", { name: /activity log/i }),
      ).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Application error");
    }
  });

  test("permission-slip + treasury + reports overview pages render", async ({ page }) => {
    test.setTimeout(60_000);
    await signIn(page);

    for (const path of [
      "/admin/permission-slips",
      "/admin/treasury",
      "/admin/treasury/posting",
      "/admin/treasury/ledger",
      "/admin/treasury/reports",
      "/admin/treasury/balances",
      "/admin/treasury/reconcile",
      "/admin/treasury/settings",
      "/admin/reports",
    ]) {
      await page.goto(`${TENANT}${path}`);
      await expect(
        page.locator("body"),
        `body for ${path} contains "Application error"`,
      ).not.toContainText("Application error");
    }
  });
});
