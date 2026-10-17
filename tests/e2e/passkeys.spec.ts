// Passkeys end to end in Chromium, with a virtual authenticator standing
// in for Touch ID or a phone: add one from the prompt right after sign-up,
// sign out, sign in with it on a unit subdomain (same passkey, since the
// apex and its subdomains share one relying party), then remove it. The second
// step and the edge cases are in src/lib/auth/passkeys.db.test.ts.

import { expect, test, type Page } from "@playwright/test";
import { APEX, USER_PASSWORD, freshPage, uid } from "./helpers/flows";

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

test("add a passkey after sign-up, sign in with it, then remove it", async ({ browser }) => {
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

  // It's listed on the Security page, and the same device can't add a second.
  await page.goto(`${APEX}/account/security`);
  await expect(page.getByText(/not used yet/)).toBeVisible();
  await page.getByLabel("Name for this passkey").fill("Test laptop");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(
    page.locator('div[role="alert"]').filter({ hasText: "This device already has a passkey for your account." }),
  ).toBeVisible();
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  expect(credentials).toHaveLength(1);
  expect(credentials[0]!.rpId).toBe("localhost");

  // Sign out, then sign in with only the passkey. (On localhost a unit's
  // subdomain is its own relying party, so this stays on the apex; on a
  // real domain the apex and unit sites share passkeys, passkeys.test.ts.)
  await ctx.clearCookies();
  await page.goto(`${APEX}/login?next=/account/security`);
  await page.getByRole("button", { name: "Continue with a passkey" }).click();
  await page.waitForURL((u) => u.pathname === "/account/security");
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  await expect(page.getByText(/last used/)).toBeVisible();

  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Passkey removed." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);

  // With the passkey gone from the account, the device's copy is refused.
  await ctx.clearCookies();
  await page.goto(`${APEX}/login`);
  await page.getByRole("button", { name: "Continue with a passkey" }).click();
  await expect(page.locator('div[role="alert"]').filter({ hasText: "That passkey didn't work" })).toBeVisible();
  await ctx.close();
});
