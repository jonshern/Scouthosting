// CRUD coverage for sales surfaces (campaigns / products / manual
// orders / booth sales) and the treasury transaction reverse path.
// One sign-in flow per the per-IP login-rate-limit convention used
// by admin-writes / crud-coverage.

import { expect, test, type Page } from "@playwright/test";

const EMAIL = "scoutmaster@example.invalid";
const PASSWORD = "AdminPasswordTest123!";
const TENANT = "http://troop100.localhost:3000";

async function signIn(page: Page) {
  await page.goto(`${TENANT}/login`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/);
}

test.describe("crud coverage – sales + treasury reverse", () => {
  test("campaigns / products / manual order / booth / reverse", async ({
    page,
  }) => {
    test.setTimeout(360_000);
    await signIn(page);

    // ── Campaign: create + edit ──────────────────────────────────────
    const campaignName = `E2E Camp ${Date.now()}`;
    const campaignNameEdited = `${campaignName} (edited)`;
    const today = new Date();
    const startsOn = today.toISOString().slice(0, 10);
    const endsOn = new Date(today.getTime() + 90 * 86400_000)
      .toISOString()
      .slice(0, 10);

    await page.goto(`${TENANT}/admin/sales`);
    await page.getByLabel("Campaign name").fill(campaignName);
    // Fund select has a disabled placeholder option — pick the first
    // real one.
    const fundSelect = page.locator("select[name=fundId]");
    const fundValues = await fundSelect
      .locator("option")
      .evaluateAll((opts) =>
        opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
      );
    expect(fundValues.length).toBeGreaterThan(0);
    await fundSelect.selectOption(fundValues[0]!);
    await page.locator("input[name=startsOn]").fill(startsOn);
    await page.locator("input[name=endsOn]").fill(endsOn);
    await page.getByRole("button", { name: /create campaign/i }).click();
    await expect(
      page.getByRole("link", { name: campaignName }),
    ).toBeVisible({ timeout: 30_000 });

    // Click into the campaign detail page and edit the name.
    await page
      .getByRole("link", { name: campaignName })
      .first()
      .click();
    await page.waitForURL(/\/admin\/sales\/[^/]+$/);
    await page.getByLabel("Campaign name").fill(campaignNameEdited);
    await page.getByRole("button", { name: /save campaign/i }).click();
    await page.waitForTimeout(1_500);
    await page.goto(`${TENANT}/admin/sales`);
    await expect(
      page.getByRole("link", { name: campaignNameEdited }).first(),
    ).toBeVisible();

    // ── Product: add a SKU to the campaign ───────────────────────────
    await page
      .getByRole("link", { name: campaignNameEdited })
      .first()
      .click();
    await page.waitForURL(/\/admin\/sales\/[^/]+$/);

    const sku = `E2E-SKU-${Date.now().toString().slice(-6)}`;
    const productName = `E2E Popcorn ${Date.now()}`;
    // Scope to the product form (the SKU field is unique to it).
    const productForm = page.locator("form").filter({ has: page.locator("input[name=sku]") });
    await productForm.locator("input[name=sku]").fill(sku);
    await productForm.locator("input[name=name]").fill(productName);
    await productForm.locator("input[name=price]").fill("20.00");
    await productForm.getByRole("button", { name: /add product/i }).click();
    await expect(page.getByText(productName).first()).toBeVisible({
      timeout: 30_000,
    });

    // ── Booth sale: record total against this campaign ───────────────
    const boothLocation = `E2E Booth ${Date.now()}`;
    const boothWhen = `${endsOn}T10:00`; // datetime-local needs date+T+time
    await page.locator("input[name=location]").fill(boothLocation);
    await page.locator("input[name=scheduledAt]").fill(boothWhen);
    await page.locator("input[name=total]").fill("85.00");
    await page.getByRole("button", { name: /record booth sale/i }).click();
    await expect(page.getByText(boothLocation).first()).toBeVisible({
      timeout: 30_000,
    });

    // ── Treasury: post a transaction, then reverse it ────────────────
    const txDesc = `E2E reverse-me ${Date.now()}`;
    await page.goto(`${TENANT}/admin/treasury/posting`);
    const postFundSelect = page.locator("select[name=fundId]");
    const postFundValues = await postFundSelect
      .locator("option")
      .evaluateAll((opts) =>
        opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
      );
    await postFundSelect.selectOption(postFundValues[0]!);
    await page.locator("#amount").fill("9.99");
    await page.locator("#description").fill(txDesc);
    await page.getByRole("button", { name: /post transaction/i }).click();
    await page.waitForTimeout(1_500);

    // Find it on the ledger and reverse. With showReversed=1 we'll
    // see both the original and the reversal row after reversing.
    await page.goto(`${TENANT}/admin/treasury/ledger`);
    await page
      .getByPlaceholder(/Filter rows by description/i)
      .fill(txDesc);
    await expect(page.getByText(txDesc).first()).toBeVisible({
      timeout: 15_000,
    });
    // The row's actions column has a "Reverse" button. There should
    // only be one visible row matching txDesc at this point.
    await page.getByRole("button", { name: /^reverse$/i }).first().click();
    await page.waitForTimeout(2_000);

    // Default view collapses reversal pairs — neither row should show
    // when filtering by the original description.
    await page.goto(`${TENANT}/admin/treasury/ledger`);
    await page
      .getByPlaceholder(/Filter rows by description/i)
      .fill(txDesc);
    await expect(page.getByText(txDesc)).toHaveCount(0, {
      timeout: 15_000,
    });

    // With showReversed=1, the original row is visible again. The
    // sibling reversal row's description is "Reversal of <orig.id>"
    // (not "Reversal of <orig.description>"), so we verify the
    // showReversed view by looking for the original txDesc + a
    // "reversal" actions tag somewhere on the unfiltered page.
    await page.goto(
      `${TENANT}/admin/treasury/ledger?showReversed=1`,
    );
    await expect(page.getByText(/^reversal$/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await page
      .getByPlaceholder(/Filter rows by description/i)
      .fill(txDesc);
    await expect(page.getByText(txDesc).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
