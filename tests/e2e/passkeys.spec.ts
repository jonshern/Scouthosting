// Passkeys end to end in Chromium, with a virtual authenticator standing
// in for Touch ID or a phone: add one from the prompt right after sign-up
// (and another on /account/security), sign out,
// sign in with it on a unit subdomain (same passkey, since the apex and
// its subdomains share one relying party), then remove it. The second
// step and the edge cases are in src/lib/auth/passkeys.db.test.ts.

import { expect, test, type Page } from "@playwright/test";
import { APEX, TENANT, USER_PASSWORD, freshPage, uid } from "./helpers/flows";

async function addVirtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, authenticatorId };
}

test("add passkeys after sign-up and later, sign in with one on a unit site, then remove them", async ({ browser }) => {
  test.setTimeout(90_000);
  const email = `passkey-${uid()}@example.invalid`;
  const { ctx, page } = await freshPage(browser);
  const { cdp, authenticatorId } = await addVirtualAuthenticator(page);

  // Sign up; the next page offers a passkey.
  await page.goto(`${APEX}/signup`);
  await page.getByLabel("Your name").fill("Passkey User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(USER_PASSWORD);
  await page.getByLabel(/18 or older/).check();
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/account\/passkey/);
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await page.waitForURL(/\/account\/profile/);

  // A second one, named, from the Security page.
  await page.goto(`${APEX}/account/security`);
  await page.getByLabel("Name for this passkey").fill("Test laptop");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Passkey added." })).toBeVisible();
  await expect(page.getByText("Test laptop")).toBeVisible();
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  expect(credentials).toHaveLength(2);
  expect(credentials.every((c) => c.rpId === "localhost")).toBe(true);

  // Sign out, then sign in with only the passkey on the unit's site.
  await ctx.clearCookies();
  await page.goto(`${TENANT}/login?next=/account/security`);
  await page.getByRole("button", { name: "Continue with a passkey" }).click();
  await page.waitForURL((u) => u.pathname === "/account/security");
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  await expect(page.getByText(/last used/)).toBeVisible();

  // Remove both.
  for (let left = 2; left > 0; left--) {
    await page.getByRole("button", { name: "Remove" }).first().click();
    await expect(page.getByRole("status").filter({ hasText: "Passkey removed." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(left - 1);
  }

  // With the passkeys gone from the account, the device's copies are refused.
  await ctx.clearCookies();
  await page.goto(`${TENANT}/login`);
  await page.getByRole("button", { name: "Continue with a passkey" }).click();
  await expect(page.locator('div[role="alert"]').filter({ hasText: "That passkey didn't work" })).toBeVisible();
  await ctx.close();
});
