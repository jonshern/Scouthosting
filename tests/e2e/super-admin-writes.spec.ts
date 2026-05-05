// Super-admin happy-path: signed in as the seeded super-admin user
// (super@example.invalid), exercise plan change + suspend/restore.

import { expect, test, type Page } from "@playwright/test";

const SUPER_EMAIL = "super@example.invalid";
const PASSWORD = "AdminPasswordTest123!";

async function signInApex(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(SUPER_EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("/");
}

test.describe("super-admin write actions", () => {
  test("plan change + suspend + restore", async ({ page }) => {
    test.setTimeout(120_000);
    await signInApex(page);

    // Plan: switch troop100 to "troop" then back to "patrol".
    await page.goto("/super-admin/orgs/troop100");
    await page.locator('select[name="plan"]').selectOption("troop");
    await page
      .locator("form", { has: page.locator('select[name="plan"]') })
      .getByRole("button", { name: /change plan/i })
      .click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.goto("/super-admin/orgs/troop100");
    await expect(page.locator('select[name="plan"]')).toHaveValue("troop");

    await page.locator('select[name="plan"]').selectOption("patrol");
    await page
      .locator("form", { has: page.locator('select[name="plan"]') })
      .getByRole("button", { name: /change plan/i })
      .click();
    await page.waitForLoadState("networkidle").catch(() => {});

    // Suspend.
    await page.goto("/super-admin/orgs/troop100");
    const suspendReason = `e2e suspend ${Date.now()}`;
    await page.locator('input[name="reason"]').fill(suspendReason);
    await page.getByRole("button", { name: /suspend org/i }).click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.goto("/super-admin/orgs/troop100");
    await expect(page.getByText(suspendReason)).toBeVisible();
    await expect(page.getByRole("button", { name: /restore/i })).toBeVisible();

    // Restore.
    await page.getByRole("button", { name: /restore/i }).click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.goto("/super-admin/orgs/troop100");
    await expect(page.getByRole("button", { name: /suspend org/i })).toBeVisible();
  });
});
