// CRUD coverage for the remaining write-bearing admin surfaces:
//   - Surveys: create
//   - Newsletter schedule: update settings
//
// Skipped because no admin write UI exists today:
//   - Reimbursements: status update only (data submitted externally)
//   - Training: read-only matrix
//   - Merit-badge counselors: read-only directory
//   - Reports / Audit: read-only

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

test.describe("crud coverage – misc", () => {
  test("surveys create + appears in list", async ({ page }) => {
    test.setTimeout(60_000);
    await signIn(page);

    const ts = Date.now();
    const surveyTitle = `E2E Survey ${ts}`;
    const surveySlug = `e2e-survey-${ts}`;

    await page.goto(`${TENANT}/admin/surveys/new`);
    await page.locator("input[name=title]").fill(surveyTitle);
    await page.locator("input[name=slug]").fill(surveySlug);
    await page.locator("textarea[name=description]").fill("Smoke survey from CRUD spec.");
    await page
      .locator("textarea[name=questions]")
      .fill("text|Your name\nlong|Anything to share?");
    await page.getByRole("button", { name: /create survey/i }).click();
    // createSurvey redirects to /admin/surveys.
    await page.waitForURL(/\/admin\/surveys$/, { timeout: 30_000 });
    await expect(
      page.getByRole("link", { name: surveyTitle }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("newsletter schedule: save settings round-trip", async ({ page }) => {
    test.setTimeout(60_000);
    await signIn(page);

    await page.goto(`${TENANT}/admin/newsletters/schedule`);
    // Any deterministic value the form will accept; use minStories=4
    // because the default may already be 4 — toggle paused too so we
    // get an observable change either way.
    const wasPausedBefore = await page
      .locator('input[name="paused"]')
      .isChecked();
    await page.locator('input[name="paused"]').setChecked(!wasPausedBefore);
    await page.locator('input[name="minStories"]').fill("5");
    await page.getByRole("button", { name: /^save$/i }).click();
    await page.waitForTimeout(1_500);

    // Round-trip: reload the page and confirm the new values stuck.
    await page.goto(`${TENANT}/admin/newsletters/schedule`);
    const isPausedAfter = await page
      .locator('input[name="paused"]')
      .isChecked();
    expect(isPausedAfter).toBe(!wasPausedBefore);
    await expect(page.locator('input[name="minStories"]')).toHaveValue("5");

    // Restore the original paused state so we don't leave the test DB
    // in a permanently-paused or unpaused state.
    await page.locator('input[name="paused"]').setChecked(wasPausedBefore);
    await page.getByRole("button", { name: /^save$/i }).click();
    await page.waitForTimeout(1_500);
  });
});
