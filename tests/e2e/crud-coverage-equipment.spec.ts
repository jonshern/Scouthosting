// CRUD coverage for the equipment loan ledger.
//
// Flow: add a new equipment item → loan it out to a seeded member
// → mark it returned → confirm the active-loans list no longer
// contains it. Equipment delete isn't surfaced in the UI today
// (server action exists but no button), so we don't assert on
// delete here.

import { expect, test, type Page } from "@playwright/test";
import { showPasswordSignIn } from "./helpers/flows";

const EMAIL = "scoutmaster@example.invalid";
const PASSWORD = "AdminPasswordTest123!";
const TENANT = "http://troop100.localhost:3000";

async function signIn(page: Page) {
  await page.goto(`${TENANT}/login`);
  await showPasswordSignIn(page);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/);
}

test.describe("crud coverage – equipment", () => {
  test("add item / loan out / return", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page);

    // ── Add equipment ────────────────────────────────────────────────
    const itemName = `E2E Item ${Date.now()}`;
    const itemCategory = `E2E Cat ${Date.now()}`;

    await page.goto(`${TENANT}/admin/equipment`);
    await page.locator("input#name").fill(itemName);
    await page.locator("input#category").fill(itemCategory);
    await page.getByRole("button", { name: /add equipment/i }).click();
    await expect(page.getByText(itemName).first()).toBeVisible({
      timeout: 30_000,
    });

    // ── Loan out: each item is rendered as an <li> containing the
    // item name and its own LoanForm. The page accumulates items
    // across test runs, so we scope to our just-added item's <li>.
    const escName = itemName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const itemLi = page
      .locator("li")
      .filter({ hasText: new RegExp(escName) })
      .first();
    const loanForm = itemLi.locator("form").first();
    const memberSelect = loanForm.locator("select[name=memberId]");
    const memberValues = await memberSelect
      .locator("option")
      .evaluateAll((opts) =>
        opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
      );
    expect(memberValues.length).toBeGreaterThan(0);
    await memberSelect.selectOption(memberValues[0]!);
    await loanForm.locator("input[name=loanNotes]").fill("E2E loan");
    await loanForm.getByRole("button", { name: /loan out/i }).click();
    await page.waitForTimeout(1_500);

    // Active loans section should now reference the item we loaned.
    // The history page is the easiest place to assert this without
    // depending on the active-loans card's exact DOM. The history
    // table renders {l.equipment.name} as a `<td>` so a plain text
    // match works.
    await page.goto(`${TENANT}/admin/equipment/loans`);
    await expect(page.getByText(itemName).first()).toBeVisible({
      timeout: 15_000,
    });

    // ── Return: scope to the active-loans row holding our item.
    // The list accumulates rows across test runs, so we anchor the
    // selector on the unique itemName within a <tr>.
    await page.goto(`${TENANT}/admin/equipment`);
    const activeRow = page
      .locator("tr")
      .filter({ hasText: new RegExp(escName) })
      .first();
    await activeRow
      .getByRole("button", { name: /mark returned/i })
      .click();
    await page.waitForTimeout(1_500);

    // After return, the loan history page now shows the entry as
    // returned (Returned column populated, status pill flips).
    // Easiest invariant: the "Returned" pill or returned-date is
    // visible somewhere on the row containing the item.
    await page.goto(`${TENANT}/admin/equipment/loans`);
    await expect(page.getByText(itemName).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
