// Mint → use → revoke flow. Exercises the full API-token lifecycle
// end-to-end through the cookie-session mint endpoint and the
// account/api-tokens revoke form.

import { expect, test, type Page } from "@playwright/test";
import { showPasswordSignIn } from "./helpers/flows";
import { E2E_PORT } from "./helpers/ports";

const EMAIL = "scoutmaster@example.invalid";
const PASSWORD = "AdminPasswordTest123!";

async function signIn(page: Page) {
  await page.goto("/login");
  await showPasswordSignIn(page);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/);
}

test.describe("API token lifecycle", () => {
  test("mint, call /api/v1/auth/me, then revoke from the account page", async ({ page }) => {
    await signIn(page);

    const mintRes = await page.request.post("/api/v1/auth/token", {
      data: { name: `Lifecycle test ${Date.now()}` },
    });
    expect(mintRes.status()).toBe(200);
    const { raw, id } = (await mintRes.json()) as { raw: string; id: string };
    expect(raw).toMatch(/^compass_pat_/);

    // Use it.
    const meRes = await page.request.get(`http://localhost:${E2E_PORT}/api/v1/auth/me`, {
      headers: { authorization: `Bearer ${raw}` },
    });
    expect(meRes.status()).toBe(200);

    // Revoke via the account page.
    await page.goto("/account/api-tokens");
    const revokeForm = page.locator(`input[name=id][value="${id}"]`).locator("..");
    await revokeForm.getByRole("button", { name: /revoke/i }).click();
    await page.waitForURL(/\/account\/api-tokens/);

    // After revoke, the token's row is gone.
    await expect(page.locator(`input[name=id][value="${id}"]`)).toHaveCount(0);

    // Calling /api/v1/auth/me with the revoked token now 401s.
    const after = await page.request.get(`http://localhost:${E2E_PORT}/api/v1/auth/me`, {
      headers: { authorization: `Bearer ${raw}` },
    });
    expect(after.status()).toBe(401);
  });
});
