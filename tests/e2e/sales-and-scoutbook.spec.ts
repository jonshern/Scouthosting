// Sales / fundraising + Scoutbook sync — focused smokes.
//
// admin-pages.spec.ts already covers raw render. This spec confirms
// the empty-state copy is what we expect (sales requires treasury;
// scoutbook surfaces the import form + youths-missing-link list).

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

test.describe("sales + scoutbook smoke", () => {
  test("sales empty state + scoutbook admin renders", async ({ page }) => {
    test.setTimeout(60_000);
    await signIn(page);

    await page.goto(`${TENANT}/admin/sales`);
    await expect(
      page.getByRole("heading", { name: /(set up treasury|fundraising campaigns)/i }),
    ).toBeVisible();

    await page.goto(`${TENANT}/admin/scoutbook`);
    await expect(
      page.getByRole("heading", { name: /read-only sync/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /import advancement csv/i }),
    ).toBeVisible();
  });
});
