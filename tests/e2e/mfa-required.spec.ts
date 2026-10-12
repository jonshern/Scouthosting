// Organizer two-step requirement (PR #120), against the second test
// server on :3001 that runs WITHOUT ALLOW_ADMIN_WITHOUT_MFA (see
// playwright.config.ts). Leaders/admins must turn on two-step sign-in
// before the admin pages or the phone app work, and can't turn it off;
// parents aren't affected.

import { expect, test, type Page } from "@playwright/test";
import * as OTPAuth from "otpauth";
import { USER_PASSWORD, freshPage, signUp, uid } from "./helpers/flows";
import { grantRole } from "./helpers/db";

const MFA_APEX = "http://localhost:3001";
const CALLBACK = "compass://auth/callback";

function totp(secret: string, windowOffset = 0): string {
  return new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  }).generate({ timestamp: Date.now() + windowOffset * 30_000 });
}

async function locationPath(page: Page, path: string): Promise<{ status: number; path: string }> {
  const res = await page.request.get(`${MFA_APEX}${path}`, { maxRedirects: 0 });
  const loc = res.headers().location;
  if (!loc) return { status: res.status(), path: "" };
  const u = new URL(loc, MFA_APEX);
  return { status: res.status(), path: `${u.pathname}${u.search}` };
}

test.describe("organizer two-step requirement", () => {
  test("a leader without two-step is sent to set it up, then gets in and can't turn it off", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const email = `mfa-leader-${uid()}@example.invalid`;
    const { ctx, page } = await freshPage(browser);
    await signUp(page, "Leader Lima", email, USER_PASSWORD, MFA_APEX);
    await grantRole(email, "leader", { yptCurrent: true });

    // Admin pages bounce to the setup page.
    await page.goto(`${MFA_APEX}/o/troop100/admin`);
    await expect(page).toHaveURL(/\/account\/security\?required=1&next=%2Fo%2Ftroop100%2Fadmin$/);
    await expect(page.getByText("Leaders and admins need two-step sign-in.")).toBeVisible();
    await page.goto(`${MFA_APEX}/o/troop100/admin/members`);
    await expect(page).toHaveURL(/\/account\/security\?required=1/);
    await expect(page.getByText("avery@example.invalid")).toHaveCount(0);

    // So does phone-app sign-in.
    const begin = `/auth/mobile/begin?redirect=${encodeURIComponent(CALLBACK)}`;
    const gated = await locationPath(page, begin);
    expect(gated.status).toBe(307);
    expect(gated.path).toBe(`/account/security?required=1&next=${encodeURIComponent(begin)}`);

    // Turn it on from the page they were sent to.
    await page.getByRole("button", { name: "Set up 2FA" }).click();
    const secret = (await page.locator("p", { hasText: "Manual secret:" }).locator("code").textContent())!.trim();
    await page.getByLabel("Code from your authenticator").fill(totp(secret));
    await page.getByRole("button", { name: /confirm and enable 2fa/i }).click();
    const done = page.getByRole("status").filter({ hasText: "2FA enabled." });
    await expect(done).toBeVisible();
    await done.getByRole("link", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/o\/troop100\/admin$/);
    await expect(page.getByRole("heading", { name: /coming up/i })).toBeVisible();

    // Phone sign-in now reaches the confirm step.
    expect((await locationPath(page, begin)).path).toBe(
      `/auth/mobile/confirm?redirect=${encodeURIComponent(CALLBACK)}`,
    );

    // And two-step can't be switched off.
    await page.goto(`${MFA_APEX}/account/security`);
    await page.locator("#disable-code").fill(totp(secret, 1));
    await page.getByRole("button", { name: "Disable 2FA" }).click();
    await expect(
      page.locator('div[role="alert"]').filter({ hasText: "Leaders and admins must keep two-step sign-in on." }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText("2FA is enabled on your account.")).toBeVisible();
    await ctx.close();
  });

  test("a parent isn't asked for two-step", async ({ browser }) => {
    const email = `mfa-parent-${uid()}@example.invalid`;
    const { ctx, page } = await freshPage(browser);
    await signUp(page, "Parent Papa", email, USER_PASSWORD, MFA_APEX);
    await grantRole(email, "parent");
    const begin = `/auth/mobile/begin?redirect=${encodeURIComponent(CALLBACK)}`;
    expect((await locationPath(page, begin)).path).toBe(
      `/auth/mobile/confirm?redirect=${encodeURIComponent(CALLBACK)}`,
    );
    await page.goto(`${MFA_APEX}/account/security`);
    await expect(page.getByText("Leaders and admins need two-step sign-in.")).toHaveCount(0);
    await ctx.close();
  });
});
