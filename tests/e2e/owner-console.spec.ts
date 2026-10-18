// The owner console (/super-admin): the overview, a unit's license
// controls (extend trial, free access) and turning an account off and
// back on, signed in as the seeded owner (super@example.invalid).

import { expect, test, type Page } from "@playwright/test";
import { db } from "./helpers/db";
import { APEX, showPasswordSignIn, signUp, USER_PASSWORD } from "./helpers/flows";

const OWNER_EMAIL = "super@example.invalid";
const PASSWORD = "AdminPasswordTest123!";
const DAY = 24 * 60 * 60 * 1000;

async function signInOwner(page: Page) {
  await page.goto(`${APEX}/login`);
  await showPasswordSignIn(page);
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/super-admin/);
}

const stamp = Date.now().toString(36);
const slug = `owner-e2e-${stamp}`;
let orgId = "";

test.beforeAll(async () => {
  const org = await db().org.create({
    data: {
      slug,
      unitType: "Troop",
      unitNumber: "4321",
      displayName: `Owner E2E Troop ${stamp}`,
      charterOrg: "Test Church",
      city: "Anytown",
      state: "MN",
      scoutmasterName: "Test Leader",
      scoutmasterEmail: `leader-${stamp}@example.invalid`,
      trialEndsAt: new Date(Date.now() + 3 * DAY),
    },
  });
  orgId = org.id;
});

test.afterAll(async () => {
  await db().billingPayment.deleteMany({ where: { stripeInvoiceId: `in_e2e_${stamp}` } });
  if (orgId) await db().org.delete({ where: { id: orgId } }).catch(() => {});
});

test("overview and units list show licenses", async ({ page }) => {
  await signInOwner(page);
  await expect(page.getByRole("heading", { name: "Owner console" })).toBeVisible();
  await expect(page.getByText("Trials ending this week")).toBeVisible();
  // The new unit's trial ends in 3 days, so it's listed there.
  await expect(page.getByRole("link", { name: `Owner E2E Troop ${stamp}` }).first()).toBeVisible();

  await page.goto(`${APEX}/super-admin/orgs?kind=trial`);
  await expect(page.getByRole("link", { name: `Owner E2E Troop ${stamp}` })).toBeVisible();
  await page.goto(`${APEX}/super-admin/orgs?kind=paid`);
  await expect(page.getByRole("link", { name: `Owner E2E Troop ${stamp}` })).toHaveCount(0);
});

test("extend a trial, give free access, end it; each lands in the history", async ({ page }) => {
  await signInOwner(page);
  await page.goto(`${APEX}/super-admin/orgs/${slug}`);
  await expect(page.getByText("On trial", { exact: true })).toBeVisible();

  await page.getByLabel("Add").fill("10");
  await page.getByRole("button", { name: "Extend trial" }).click();
  await expect(page.getByRole("status")).toContainText("Trial now ends");
  await expect(page.getByText(/^13 days left/)).toBeVisible();

  const until = new Date(Date.now() + 60 * DAY).toISOString().slice(0, 10);
  await page.getByLabel("Free until").fill(until);
  await page.getByLabel("Why").fill("Pilot unit");
  await page.getByRole("button", { name: "Give free access" }).click();
  await expect(page.getByRole("status")).toContainText(`Free access until ${until}`);
  await expect(page.getByText("Free access", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "End free access" }).click();
  await expect(page.getByRole("status")).toContainText("Free access ended");
  await expect(page.getByText("On trial", { exact: true })).toBeVisible();

  const history = page.locator("section", { has: page.getByRole("heading", { name: "History" }) });
  await expect(history).toContainText("org.trial_extend");
  await expect(history).toContainText("org.comp");
  await expect(history).toContainText("org.comp_end");
});

test("turning an account off signs it out and refuses sign-in until it's back on", async ({ browser, page }) => {
  test.setTimeout(90_000);
  const email = `owner-target-${stamp}@example.invalid`;
  const target = await browser.newContext();
  const targetPage = await target.newPage();
  await signUp(targetPage, "Target Person", email, USER_PASSWORD, APEX);

  await signInOwner(page);
  await page.goto(`${APEX}/super-admin/people?q=${encodeURIComponent(email)}`);
  await page.getByRole("link", { name: "Target Person" }).click();
  await page.getByLabel("Why").fill("e2e check");
  await page.getByRole("button", { name: "Turn account off" }).click();
  await expect(page.getByRole("status")).toContainText("Account turned off");
  await expect(page.getByText("Turned off", { exact: true })).toBeVisible();

  // Their open session no longer works.
  await targetPage.goto(`${APEX}/account`);
  await expect(targetPage).toHaveURL(/\/login/);
  // And a new sign-in is refused.
  await showPasswordSignIn(targetPage);
  await targetPage.getByLabel("Email").fill(email);
  await targetPage.getByLabel("Password").fill(USER_PASSWORD);
  await targetPage.waitForTimeout(1700);
  await targetPage.getByRole("button", { name: /sign in/i }).click();
  await expect(targetPage.getByText("This account is turned off.")).toBeVisible();
  await targetPage.goto(`${APEX}/account`);
  await expect(targetPage).toHaveURL(/\/login/);

  await page.getByRole("button", { name: "Turn account back on" }).click();
  await expect(page.getByRole("status")).toContainText("Account turned back on");
  await expect(page.locator("section", { has: page.getByRole("heading", { name: "History" }) })).toContainText("user.disable");
  await target.close();
});

test("billing report shows a recorded test-mode payment and exports it", async ({ page }) => {
  await db().billingPayment.create({
    data: {
      orgId,
      stripeInvoiceId: `in_e2e_${stamp}`,
      amountCents: 9900,
      currency: "usd",
      livemode: false,
      paidAt: new Date(),
    },
  });
  await signInOwner(page);
  await page.goto(`${APEX}/super-admin/billing?mode=test`);
  await expect(page.getByRole("heading", { name: "Collected (Stripe test mode)" })).toBeVisible();
  const recent = page.locator("section", { has: page.getByRole("heading", { name: "Recent payments" }) });
  await expect(recent).toContainText(`Owner E2E Troop ${stamp}`);
  await expect(recent).toContainText("$99.00");

  const csv = await page.request.get(`${APEX}/super-admin/billing/payments.csv?mode=test`);
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain(`in_e2e_${stamp}`);
});

test("the payments export refuses anyone who isn't the owner", async ({ request }) => {
  const res = await request.get(`${APEX}/super-admin/billing/payments.csv?mode=test`);
  expect(res.status()).not.toBe(200);
  expect(await res.text()).not.toContain("stripe_invoice");
});
