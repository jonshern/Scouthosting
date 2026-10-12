// CRUD coverage for admin surfaces that previously had render-only
// smoke. Designed as a single long flow with one sign-in to avoid
// the per-IP login rate limit (same convention as admin-writes.spec).
//
// Surfaces touched:
//   - Patrols       (create / edit / delete)
//   - Locations     (create / edit / delete)
//   - Fiscal years  (create / edit)
//   - Treasury post (post a transaction, verify it lands on the ledger)
//
// Note: server actions here return state (not a redirect). They call
// `revalidatePath` so the new row shows up on the same URL after the
// click — we don't rely on re-navigation. We avoid
// `waitForLoadState("networkidle")` because the production build keeps
// long-lived connections open (SSE chat, etc) and networkidle can stall.

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

test.describe("crud coverage", () => {
  test("patrols / locations / fiscal years / treasury", async ({ page }) => {
    test.setTimeout(420_000);
    await signIn(page);

    // ── Patrols: create + edit + delete ──────────────────────────────
    const patrolName = `E2E Patrol ${Date.now()}`;
    const patrolNameEdited = `${patrolName} (edited)`;

    await page.goto(`${TENANT}/admin/patrols`);
    await page.locator("input[name=name]").fill(patrolName);
    await page
      .locator("textarea[name=description]")
      .fill("Created from CRUD coverage spec.");
    await page.getByRole("button", { name: /create patrol/i }).click();
    await expect(
      page.getByRole("link", { name: patrolName }),
    ).toBeVisible({ timeout: 30_000 });

    await page
      .getByRole("link", { name: patrolName })
      .first()
      .click();
    await page.waitForURL(/\/admin\/patrols\/[^/]+$/);
    await page.locator("input[name=name]").fill(patrolNameEdited);
    await page.getByRole("button", { name: /save patrol/i }).click();
    await page.waitForTimeout(1_500);
    await page.goto(`${TENANT}/admin/patrols`);
    await expect(
      page.getByRole("link", { name: patrolNameEdited }).first(),
    ).toBeVisible();

    await page
      .getByRole("link", { name: patrolNameEdited })
      .first()
      .click();
    await page.waitForURL(/\/admin\/patrols\/[^/]+$/);
    await page.getByRole("button", { name: /^delete$/i }).click();
    await page.getByRole("button", { name: /yes, delete/i }).click();
    await page.waitForTimeout(1_500);
    await page.goto(`${TENANT}/admin/patrols`);
    await expect(
      page.getByRole("link", { name: patrolNameEdited }),
    ).toHaveCount(0);

    // ── Locations: create + edit + delete ────────────────────────────
    const locName = `E2E Loc ${Date.now()}`;
    const locNameEdited = `${locName} (edited)`;

    await page.goto(`${TENANT}/admin/locations`);
    await page.locator("input[name=name]").fill(locName);
    await page.locator("input[name=address]").fill("123 Trail Rd");
    await page
      .locator("textarea[name=description]")
      .fill("Picnic-table site behind the rec hall.");
    await page.getByRole("button", { name: /create location/i }).click();
    await expect(
      page.getByRole("link", { name: locName }),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole("link", { name: locName }).first().click();
    await page.waitForURL(/\/admin\/locations\/[^/]+$/);
    await page.locator("input[name=name]").fill(locNameEdited);
    await page.getByRole("button", { name: /save location/i }).click();
    await page.waitForTimeout(1_500);
    await page.goto(`${TENANT}/admin/locations`);
    await expect(
      page.getByRole("link", { name: locNameEdited }).first(),
    ).toBeVisible();

    await page
      .getByRole("link", { name: locNameEdited })
      .first()
      .click();
    await page.waitForURL(/\/admin\/locations\/[^/]+$/);
    await page.getByRole("button", { name: /^delete$/i }).click();
    await page.getByRole("button", { name: /yes, delete/i }).click();
    await page.waitForTimeout(1_500);
    await page.goto(`${TENANT}/admin/locations`);
    await expect(
      page.getByRole("link", { name: locNameEdited }),
    ).toHaveCount(0);

    // ── Fiscal years: create + edit ──────────────────────────────────
    const fyLabel = `E2E FY ${Date.now()}`;
    const fyLabelEdited = `${fyLabel}+`;
    const futureYear = new Date().getFullYear() + 10;
    const start = `${futureYear}-01-01`;
    const end = `${futureYear}-12-31`;

    await page.goto(`${TENANT}/admin/treasury/fiscal-years`);
    await page.locator("input[name=label]").fill(fyLabel);
    await page.locator("input[name=startsOn]").fill(start);
    await page.locator("input[name=endsOn]").fill(end);
    await page.getByRole("button", { name: /create fiscal year/i }).click();
    await expect(
      page.getByRole("link", { name: fyLabel }),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole("link", { name: fyLabel }).first().click();
    await page.waitForURL(/\/admin\/treasury\/fiscal-years\/[^/]+$/);
    await page.locator("input[name=label]").fill(fyLabelEdited);
    await page.getByRole("button", { name: /save fiscal year/i }).click();
    await page.waitForTimeout(1_500);
    await page.goto(`${TENANT}/admin/treasury/fiscal-years`);
    await expect(
      page.getByRole("link", { name: fyLabelEdited }).first(),
    ).toBeVisible();

    // ── Treasury: post a manual transaction → appears on ledger ──────
    const txDesc = `E2E txn ${Date.now()}`;

    await page.goto(`${TENANT}/admin/treasury/posting`);
    const fundSelect = page.locator("select[name=fundId]");
    const fundValues = await fundSelect
      .locator("option")
      .evaluateAll((opts) =>
        opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
      );
    expect(fundValues.length).toBeGreaterThan(0);
    await fundSelect.selectOption(fundValues[0]!);
    // The posting page has three forms (single tx / bulk dues /
    // transfer) with overlapping field names. Scope to the first form
    // (single transaction) using its unique `#amount` id.
    await page.locator("#amount").fill("12.34");
    await page.locator("#description").fill(txDesc);
    await page.getByRole("button", { name: /post transaction/i }).click();
    await page.waitForTimeout(1_500);

    await page.goto(`${TENANT}/admin/treasury/ledger`);
    await page.getByPlaceholder(/Filter rows by description/i).fill(txDesc);
    await expect(page.getByText(txDesc).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
