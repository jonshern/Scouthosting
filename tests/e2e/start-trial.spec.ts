// Self-serve sign-up: a new adult creates an account at /start, sets up
// a unit, gets its recovery code once, and lands in the unit's admin
// with the free-trial banner and a billing page. The e2e server has no
// Stripe keys, so billing shows as not switched on and nothing locks.

import { expect, test } from "@playwright/test";

test("a new leader signs up, creates a unit and starts a 30-day trial", async ({ page }) => {
  const stamp = Date.now();
  const unitNumber = String(10000 + (stamp % 89999));

  await page.goto("/");
  await page.getByRole("link", { name: "Start a trial" }).click();
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByText(/30 days free/i).first()).toBeVisible();

  await page.getByLabel("Your name").fill("Robin Leader");
  await page.getByLabel("Email").fill(`robin+${stamp}@example.invalid`);
  await page.getByLabel("Password").fill("CorrectHorseBatteryStaple!");
  await page.getByLabel(/18 or older/).check();
  // The honeypot rejects forms submitted faster than a person types.
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /create account/i }).click();

  await expect(page.getByRole("heading", { name: "Tell us about your unit" })).toBeVisible();
  await page.getByLabel("Unit type").selectOption("Troop");
  await page.getByLabel("Number").fill(unitNumber);
  await page.getByLabel("Chartered organization").fill("First Lutheran Church");
  await page.getByLabel("City").fill("Anytown");
  await page.getByLabel("State").fill("MN");
  await page.getByLabel("Unit passphrase").fill("our-unit-passphrase-1");
  await page.getByLabel("Passphrase again").fill("our-unit-passphrase-1");
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /start my 30-day free trial/i }).click();

  await expect(page.getByTestId("start-trial-done")).toBeVisible();
  await expect(page.getByText(`Troop ${unitNumber} is set up.`)).toBeVisible();
  await expect(page.getByTestId("recovery-code")).not.toBeEmpty();

  await page.getByRole("link", { name: /go to your unit/i }).click();
  await expect(page).toHaveURL(new RegExp(`/o/troop${unitNumber}(-[a-z0-9-]+)?/admin$`));
  await expect(page.getByTestId("billing-banner")).toContainText("30 days left in your free trial");

  await page.getByTestId("billing-banner").getByRole("link", { name: /billing/i }).click();
  await expect(page.getByTestId("billing-status")).toContainText("30 days left in your free trial");
  await expect(page.getByTestId("billing-status")).toContainText("Billing isn't switched on");
});
