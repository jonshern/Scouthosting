// Member drawer overlay — clicking a roster row sets ?member=<id>
// and renders the detail in an overlay; pressing Esc closes it.

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

test.describe("member drawer overlay", () => {
  test("row click opens drawer; Esc closes; URL syncs", async ({ page }) => {
    test.setTimeout(60_000);
    await signIn(page);

    await page.goto(`${TENANT}/admin/members?tab=adults`);
    await expect(page.getByRole("heading", { name: /members/i })).toBeVisible();

    // Click the seeded "Avery Adult" row name.
    await page.getByRole("link", { name: "Avery Adult" }).first().click();

    // URL gains ?member=<id> and the drawer chrome appears.
    await page.waitForURL(/[?&]member=/);
    await expect(page.getByRole("dialog", { name: /member detail/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Avery Adult/i }),
    ).toBeVisible();

    // Esc closes — URL drops the member param.
    await page.keyboard.press("Escape");
    await page.waitForURL((u) => !u.searchParams.has("member"));
    await expect(
      page.getByRole("dialog", { name: /member detail/i }),
    ).toHaveCount(0);
  });
});
