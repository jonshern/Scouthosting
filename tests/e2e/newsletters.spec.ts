// Newsletter scheduler write path.

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
  await page.waitForURL(/\/admin/);
}

test.describe("newsletters", () => {
  test("schedule: save persists across reload", async ({ page }) => {
    await signInTenant(page);
    await page.goto(`${TENANT}/admin/newsletters/schedule`);
    await expect(page.getByRole("heading", { name: /newsletter schedule/i })).toBeVisible();

    await page.getByLabel("Weekday (1=Mon … 7=Sun)").fill("3");
    await page.getByLabel("Local time (HH:MM)").fill("18:30");
    await page.getByLabel("Timezone (IANA)").fill("America/Chicago");
    await page.locator("input[name=minStories]").fill("4");
    await page.getByRole("button", { name: /^save$/i }).click();
    await page.waitForURL(/\/admin\/newsletters/);

    await page.goto(`${TENANT}/admin/newsletters/schedule`);
    await expect(page.getByLabel("Weekday (1=Mon … 7=Sun)")).toHaveValue("3");
    await expect(page.getByLabel("Local time (HH:MM)")).toHaveValue("18:30");
    await expect(page.getByLabel("Timezone (IANA)")).toHaveValue("America/Chicago");
  });
});
