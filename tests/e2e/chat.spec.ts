// Chat surface (read-only render) + channels admin landing.

import { expect, test, type Page } from "@playwright/test";

const EMAIL = "scoutmaster@example.invalid";
const PASSWORD = "AdminPasswordTest123!";
const TENANT = "http://troop100.localhost:3000";

async function signInTenant(page: Page) {
  await page.goto(`${TENANT}/login`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(`${TENANT}/`);
}

test.describe("chat", () => {
  test("/chat renders with channels sidebar", async ({ page }) => {
    await signInTenant(page);
    await page.goto(`${TENANT}/chat`);
    await expect(page.getByRole("heading", { level: 1, name: /chat/i })).toBeVisible();
    await expect(page.getByText("Channels")).toBeVisible();
  });

  test("admin/channels lists channels", async ({ page }) => {
    await signInTenant(page);
    await page.goto(`${TENANT}/admin/channels`);
    await expect(page.getByRole("heading", { level: 1, name: /channels/i })).toBeVisible();
  });

  test("admin/dm renders the DM thread list", async ({ page }) => {
    await signInTenant(page);
    await page.goto(`${TENANT}/admin/dm`);
    await expect(page.getByRole("heading", { level: 1, name: /direct messages/i })).toBeVisible();
  });
});
