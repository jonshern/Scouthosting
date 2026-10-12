// Passkeys end to end in Chromium, with a virtual authenticator standing
// in for Touch ID or a phone: add one on /account/security, sign out,
// sign in with it on a unit subdomain (same passkey, since the apex and
// its subdomains share one relying party), then remove it. The second
// step and the edge cases are in src/lib/auth/passkeys.db.test.ts.

import { expect, test, type Page } from "@playwright/test";
import { APEX, TENANT, freshPage, signUp, uid } from "./helpers/flows";

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

test("add a passkey, sign in with it on a unit site, then remove it", async ({ browser }) => {
  test.setTimeout(90_000);
  const email = `passkey-${uid()}@example.invalid`;
  const { ctx, page } = await freshPage(browser);
  const { cdp, authenticatorId } = await addVirtualAuthenticator(page);

  await signUp(page, "Passkey User", email, undefined, APEX);
  await page.goto(`${APEX}/account/security`);
  await page.getByLabel("Name for this passkey").fill("Test laptop");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Passkey added." })).toBeVisible();
  await expect(page.getByText("Test laptop")).toBeVisible();
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  expect(credentials).toHaveLength(1);
  expect(credentials[0]!.rpId).toBe("localhost");

  // Sign out, then sign in with only the passkey on the unit's site.
  await ctx.clearCookies();
  await page.goto(`${TENANT}/login?next=/account/security`);
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await page.waitForURL((u) => u.pathname === "/account/security");
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  await expect(page.getByText(/last used/)).toBeVisible();

  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Passkey removed." })).toBeVisible();
  await expect(page.getByText("Test laptop")).toHaveCount(0);

  // With the passkey gone from the account, the device's copy is refused.
  await ctx.clearCookies();
  await page.goto(`${TENANT}/login`);
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page.locator('div[role="alert"]').filter({ hasText: "That passkey didn't work" })).toBeVisible();
  await ctx.close();
});
