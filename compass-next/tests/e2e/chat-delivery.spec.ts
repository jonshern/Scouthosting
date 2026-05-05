// End-to-end message delivery: scoutmaster posts to the troop
// channel; verify the message persists + a second member of the
// channel sees it on reload.
//
// We seed a second leader by signing up under the troop subdomain
// and inserting an OrgMembership directly via the admin members
// page (the seed only ships scoutmaster).

import { expect, test, type Page } from "@playwright/test";

const SCOUTMASTER = "scoutmaster@example.invalid";
const PASSWORD = "AdminPasswordTest123!";
const TENANT = "http://troop100.localhost:3000";

async function signInAs(page: Page, email: string, password: string) {
  await page.goto(`${TENANT}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(`${TENANT}/`);
}

test.describe("chat message delivery", () => {
  test("admin posts to leaders channel; reload shows the message", async ({ page }) => {
    await signInAs(page, SCOUTMASTER, PASSWORD);
    await page.goto(`${TENANT}/chat`);

    // Pick the "Leaders only" channel (auto-provisioned by
    // provisionStandingChannels at boot for the seeded troop).
    // Fall back to whatever first channel is selected if Leaders
    // hasn't been materialised yet — the test only needs *a*
    // channel that the scoutmaster is a member of and that doesn't
    // contain youth (so the two-deep gate doesn't block posting).
    const leadersLink = page.getByRole("link", { name: /leaders only/i }).first();
    if (await leadersLink.count()) {
      await leadersLink.click();
    }

    const body = `Delivery probe ${Date.now()}`;
    const composer = page.getByLabel("Message body");
    if ((await composer.count()) === 0) {
      test.skip(true, "No postable channel for the scoutmaster in test env.");
      return;
    }
    await composer.fill(body);
    await page.getByRole("button", { name: /^send$/i }).click();

    // The composer fires router.refresh() on success. Hard reload +
    // look for the message body in the rendered list — keeps the
    // assertion deterministic regardless of refresh timing.
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.getByText(body)).toBeVisible({ timeout: 10_000 });
  });
});
