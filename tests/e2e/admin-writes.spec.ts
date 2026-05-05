// Happy-path coverage for admin write actions that previously only had
// render smoke (refunds, domain, forms, canvas). One sign-in for all so
// we don't trip the per-IP login rate limit.

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
  await page.waitForURL(`${TENANT}/`);
}

test.describe("admin write actions", () => {
  test("refund + domain + form + canvas write paths", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page);

    // ── Refund: create + appears on list ───────────────────────────
    const refundReason = `E2E refund ${Date.now()}`;
    await page.goto(`${TENANT}/admin/refunds/new`);
    await page.locator("input[name=amount]").fill("12.34");
    await page.locator("textarea[name=reason]").fill(refundReason);
    await page.locator("input[name=paymentRef]").fill("e2e-ref-1");
    await page.getByRole("button", { name: /issue refund/i }).click();
    await page.waitForURL(/\/admin\/refunds(\?.*)?$/);
    await expect(page.getByText(refundReason)).toBeVisible();

    // ── Domain: set + clear ────────────────────────────────────────
    const domain = `e2e-${Date.now()}.example.invalid`;
    await page.goto(`${TENANT}/admin/domain`);
    await page.locator("input[name=domain]").fill(domain);
    await page.getByRole("button", { name: /^save$/i }).click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.goto(`${TENANT}/admin/domain`);
    await expect(page.getByText(domain).first()).toBeVisible();
    await page.getByRole("button", { name: /disconnect domain/i }).click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.goto(`${TENANT}/admin/domain`);
    await expect(page.getByText(/no custom domain attached/i)).toBeVisible();

    // ── Form: create with URL + edit title + delete ────────────────
    const formTitle = `E2E Form ${Date.now()}`;
    const formTitleEdited = `${formTitle} (edited)`;
    await page.goto(`${TENANT}/admin/forms/new`);
    await page.locator("input[name=title]").fill(formTitle);
    await page.locator("input[name=url]").fill("https://example.invalid/f");
    await page.getByRole("button", { name: /create form/i }).click();
    await page.waitForURL(/\/admin\/forms(\?.*)?$/);
    await expect(page.getByText(formTitle).first()).toBeVisible();

    // Click the Edit link in the row that has our form title.
    const formRow = page.locator("li", { hasText: formTitle }).first();
    await formRow.getByRole("link", { name: /edit/i }).click();
    await page.waitForURL(/\/admin\/forms\/[^/]+$/);
    await page.locator("input[name=title]").fill(formTitleEdited);
    await page.getByRole("button", { name: /save/i }).first().click();
    await page.waitForURL(/\/admin\/forms(\?.*)?$/);
    await expect(page.getByText(formTitleEdited)).toBeVisible();

    // Delete it.
    const editedRow = page.locator("li", { hasText: formTitleEdited }).first();
    await editedRow.getByRole("button", { name: /delete/i }).click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.goto(`${TENANT}/admin/forms`);
    await expect(page.getByText(formTitleEdited)).toHaveCount(0);

    // ── Canvas: add text block + save draft ────────────────────────
    await page.goto(`${TENANT}/admin/site`);
    await page.getByRole("button", { name: /\+ text/i }).click();
    const blockTitle = `E2E block ${Date.now()}`;
    await page.locator('input[placeholder="Title"]').first().fill(blockTitle);
    await page
      .locator('textarea[placeholder*="Body"]')
      .first()
      .fill("Hello world.");
    await page.getByRole("button", { name: /save draft/i }).click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.goto(`${TENANT}/admin/site`);
    // Draft re-renders with our value populated.
    await expect(page.locator(`input[value="${blockTitle}"]`)).toBeVisible();
    await expect(page.getByText(/unpublished draft/i)).toBeVisible();

    // Publish + verify the public site renders the block.
    await page.getByRole("button", { name: /^publish$/i }).click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.goto(`${TENANT}/`);
    await expect(page.getByText(blockTitle)).toBeVisible();
  });
});
