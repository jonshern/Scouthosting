// Roster reports hub. Section headings + per-section CSV via fetch
// in the page context (Chromium handles *.localhost; Node can't).

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

test.describe("roster reports", () => {
  test("hub renders + each CSV route returns text/csv", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page);

    await page.goto(`${TENANT}/admin/reports`);
    await expect(
      page.getByRole("heading", { name: /roster reports/i }),
    ).toBeVisible();
    for (const heading of [
      /allergies/i,
      /upcoming birthdays/i,
      /shirt sizes/i,
      /scouts by age/i,
    ]) {
      await expect(
        page.getByRole("heading", { name: heading }),
      ).toBeVisible();
    }

    for (const slug of ["dietary", "birthdays", "shirts", "ages"]) {
      const result = await page.evaluate(async (url) => {
        const res = await fetch(url, { credentials: "include" });
        return { status: res.status, contentType: res.headers.get("content-type") };
      }, `${TENANT}/admin/reports/${slug}.csv`);
      expect(result.status, `${slug}.csv status`).toBe(200);
      expect(result.contentType ?? "", `${slug}.csv content-type`).toContain("text/csv");
    }

    for (const slug of ["funds.csv", "accounts.csv", "yoy.csv"]) {
      const result = await page.evaluate(async (url) => {
        const res = await fetch(url, { credentials: "include" });
        return { status: res.status };
      }, `${TENANT}/admin/treasury/reports/${slug}`);
      expect(result.status, `treasury ${slug}`).toBeGreaterThanOrEqual(200);
      expect(result.status, `treasury ${slug}`).toBeLessThan(500);
    }
  });
});
