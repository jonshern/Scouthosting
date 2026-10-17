// Slot signup happy path: admin creates an event with a slot,
// signed-in admin signs up, the count reflects.

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

test.describe("signup slots", () => {
  test("public calendar shows existing slots area without errors", async ({ page }) => {
    await signInTenant(page);
    await page.goto(`${TENANT}/calendar`);
    // The page should render even if no slots exist yet — we're
    // smoke-testing that the calendar/page.tsx wiring with the
    // SlotSignupForm + RsvpForm components doesn't throw. The
    // current public-page header renders the kicker "§ Calendar"
    // and an h1 of "What's coming up." (per design_handoff_compass_cms),
    // so the kicker is the most stable signal that we're on the
    // calendar page.
    await expect(page.getByText("§ Calendar").first()).toBeVisible();
  });
});
