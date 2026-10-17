// Deep CRUD coverage for treasury surfaces beyond the post-a-tx +
// reverse paths already covered in crud-coverage.spec.ts and
// crud-coverage-sales.spec.ts. This spec exercises:
//   - Bulk dues posting (postBulkDuesAction)
//   - Fund-to-fund transfer (postTransferAction)
//   - Recompute balances (recomputeBalancesAction)
//   - Fiscal-year budget upsert (upsertBudget — per-fund)
//
// Out of scope (no easy E2E without external services or real CSVs):
//   - Stripe key save/clear (treasury-stripe.ts) — needs real key
//   - Bank import + reconcile — needs CSV upload fixture
//   - sendAllBalances — would email seeded members

import { expect, test, type Page } from "@playwright/test";
import { showPasswordSignIn } from "./helpers/flows";
import { E2E_PORT } from "./helpers/ports";

const EMAIL = "scoutmaster@example.invalid";
const PASSWORD = "AdminPasswordTest123!";
const TENANT = `http://troop100.localhost:${E2E_PORT}`;

async function signIn(page: Page) {
  await page.goto(`${TENANT}/login`);
  await showPasswordSignIn(page);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/);
}

test.describe("crud coverage – treasury deep", () => {
  test("bulk dues / transfer / recompute / budget", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page);

    // ── Bulk dues: post against all-active members ──────────────────
    const duesDesc = `E2E bulk dues ${Date.now()}`;
    await page.goto(`${TENANT}/admin/treasury/posting`);
    await page.locator("#bulk-amount").fill("1.00");
    await page.locator("#bulk-scope").selectOption("all-active");
    await page.locator("#bulk-description").fill(duesDesc);
    await page.getByRole("button", { name: /post dues/i }).click();
    await page.waitForTimeout(1_500);

    // The bulk-dues action posts one TX per matching member; the
    // ledger should now contain at least one row whose description
    // matches.
    await page.goto(`${TENANT}/admin/treasury/ledger`);
    await page
      .getByPlaceholder(/Filter rows by description/i)
      .fill(duesDesc);
    await expect(page.getByText(duesDesc).first()).toBeVisible({
      timeout: 15_000,
    });

    // ── Transfer between funds ──────────────────────────────────────
    const xferDesc = `E2E transfer ${Date.now()}`;
    await page.goto(`${TENANT}/admin/treasury/posting`);
    const fromSelect = page.locator("#from");
    const fromValues = await fromSelect
      .locator("option")
      .evaluateAll((opts) =>
        opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
      );
    expect(fromValues.length).toBeGreaterThanOrEqual(2);
    await fromSelect.selectOption(fromValues[0]!);
    await page.locator("#to").selectOption(fromValues[1]!);
    await page.locator("#xfer-amount").fill("5.00");
    await page.locator("#xfer-desc").fill(xferDesc);
    await page.getByRole("button", { name: /^transfer$/i }).click();
    await page.waitForTimeout(1_500);

    // Transfers post two paired txns (debit+credit) sharing the
    // description.
    await page.goto(`${TENANT}/admin/treasury/ledger`);
    await page
      .getByPlaceholder(/Filter rows by description/i)
      .fill(xferDesc);
    await expect(page.getByText(xferDesc).first()).toBeVisible({
      timeout: 15_000,
    });

    // ── Recompute balances: button on /admin/treasury overview ──────
    await page.goto(`${TENANT}/admin/treasury`);
    await page.getByRole("button", { name: /recompute balances/i }).click();
    // The button surfaces a status message inline on success. Just
    // confirm the page didn't crash by checking the button is still
    // there after a brief settle.
    await page.waitForTimeout(1_500);
    await expect(
      page.getByRole("button", { name: /recompute balances/i }),
    ).toBeVisible({ timeout: 15_000 });

    // ── Fiscal-year budget upsert ───────────────────────────────────
    // Use the future fiscal year created in crud-coverage.spec.ts
    // (label starts with "E2E FY"). If none exists yet (e.g. when
    // this spec runs first), create one inline.
    await page.goto(`${TENANT}/admin/treasury/fiscal-years`);
    let fyLink = page.getByRole("link", { name: /^E2E FY/ }).first();
    if (!(await fyLink.isVisible().catch(() => false))) {
      const fyLabel = `E2E FY ${Date.now()}`;
      const futureYear = new Date().getFullYear() + 11;
      await page.locator("input[name=label]").fill(fyLabel);
      await page
        .locator("input[name=startsOn]")
        .fill(`${futureYear}-01-01`);
      await page
        .locator("input[name=endsOn]")
        .fill(`${futureYear}-12-31`);
      await page.getByRole("button", { name: /create fiscal year/i }).click();
      await page.waitForTimeout(1_500);
      await page.goto(`${TENANT}/admin/treasury/fiscal-years`);
      fyLink = page.getByRole("link", { name: /^E2E FY/ }).first();
    }
    await fyLink.click();
    await page.waitForURL(/\/admin\/treasury\/fiscal-years\/[^/]+$/);

    // Each fund renders its own SingleBudgetRow with name="expected".
    // Pick the first one and save a budget value.
    const budgetForm = page
      .locator("form")
      .filter({ has: page.locator('input[name="expected"]') })
      .first();
    await budgetForm.locator('input[name="expected"]').fill("123.45");
    await budgetForm
      .locator('input[name="notes"]')
      .fill("E2E budget note");
    await budgetForm.getByRole("button", { name: /^save$/i }).click();
    await page.waitForTimeout(1_500);

    // Reload the FY detail page and confirm the value persisted.
    await page.reload();
    await expect(
      page.locator('input[name="expected"]').first(),
    ).toHaveValue("123.45");
  });
});
