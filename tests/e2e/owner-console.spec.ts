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
  if (orgId) await db().signupReview.deleteMany({ where: { entityId: orgId } });
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

test("a question from /contact reaches the inbox and the owner answers it", async ({ browser, page }) => {
  test.setTimeout(60_000);
  const subjectLine = `How do I add a second troop ${stamp}?`;
  const visitor = await browser.newContext();
  const v = await visitor.newPage();
  await v.goto(`${APEX}/contact?product=waypoint`);
  await v.getByLabel("Your name").fill("Pat Visitor");
  await v.getByLabel("Email").fill(`pat-${stamp}@example.invalid`);
  await v.getByLabel("Type").selectOption("question");
  await v.getByLabel("Message").fill(`${subjectLine}\nWe run a troop and a crew.`);
  await v.waitForTimeout(1700);
  await v.getByRole("button", { name: "Send" }).click();
  await expect(v.getByRole("status")).toContainText("Thanks, we got it");
  await visitor.close();

  await signInOwner(page);
  await page.goto(`${APEX}/super-admin/inbox?product=waypoint`);
  await page.getByRole("link", { name: subjectLine }).click();
  await expect(page.getByText("We run a troop and a crew.")).toBeVisible();
  await page.getByLabel("Reply").fill("Add the crew as its own unit; one account can be in both.");
  await page.getByRole("button", { name: /send reply/i }).click();
  await expect(page.getByRole("status")).toContainText(/Reply (sent|saved)/);
  await expect(page.getByText("answered", { exact: true })).toBeVisible();
  await expect(page.getByText("Add the crew as its own unit; one account can be in both.")).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("status")).toContainText("Closed.");
  await db().supportTicket.deleteMany({ where: { fromEmail: `pat-${stamp}@example.invalid` } });
});

test("an app crash shows in errors, grouped, and hides once marked fixed", async ({ page, request }) => {
  const message = `Trail failed to load ${stamp}`;
  for (let i = 0; i < 2; i++) {
    const res = await request.post(`${APEX}/api/v1/errors`, {
      data: { product: "waypoint", name: "TypeError", message, context: { appVersion: "2.0.1", platform: "web" } },
    });
    expect(res.status()).toBe(200);
  }
  await signInOwner(page);
  await page.goto(`${APEX}/super-admin/errors?service=waypoint-app&days=1`);
  const group = page.getByRole("link", { name: `TypeError: ${message}` });
  await expect(group).toBeVisible();
  await expect(page.locator("li", { has: group })).toContainText("2 times");
  await group.click();
  await expect(page.getByRole("cell", { name: "2.0.1" }).first()).toBeVisible();
  await page.getByLabel("What fixed it").fill("Guarded the empty trail");
  await page.getByRole("button", { name: "Mark fixed" }).click();
  await expect(page.getByRole("status")).toContainText("Marked fixed");

  await page.goto(`${APEX}/super-admin/errors?service=waypoint-app&days=1`);
  await expect(page.getByRole("link", { name: `TypeError: ${message}` })).toHaveCount(0);
  const rows = await db().errorLog.findMany({ where: { message }, select: { fingerprint: true } });
  await db().errorResolution.deleteMany({ where: { fingerprint: { in: rows.map((r) => r.fingerprint) } } });
  await db().errorLog.deleteMany({ where: { message } });
});

test("a new unit waits in the sign-ups queue until it's marked done", async ({ page }) => {
  await signInOwner(page);
  await page.goto(`${APEX}/super-admin/signups`);
  const name = `Owner E2E Troop ${stamp}`;
  await expect(page.getByRole("link", { name })).toBeVisible();
  await page.getByRole("button", { name: `Done with ${name}` }).click();
  await expect(page.getByRole("status")).toContainText("Taken off the queue");
  await expect(page.getByRole("link", { name })).toHaveCount(0);
  await page.goto(`${APEX}/super-admin/signups?view=done`);
  await expect(page.getByRole("link", { name })).toBeVisible();
});

test("managing sign-ups: follow-up note, free access, ask to pay, decline and approve, filter by app", async ({ page }) => {
  test.setTimeout(90_000);
  const unitName = `Signup E2E Troop ${stamp}`;
  const personName = `Signup Person ${stamp}`;
  const org = await db().org.create({
    data: {
      slug: `signup-e2e-${stamp}`,
      unitType: "Troop",
      unitNumber: "8765",
      displayName: unitName,
      charterOrg: "Test Church",
      city: "Anytown",
      state: "MN",
      scoutmasterName: "Signup Leader",
      scoutmasterEmail: `signup-leader-${stamp}@example.invalid`,
      trialEndsAt: new Date(Date.now() + 20 * DAY),
    },
  });
  const person = await db().user.create({
    data: { email: `signup-person-${stamp}@example.invalid`, displayName: personName },
  });
  const inviteEmail = `invitee-${stamp}@example.invalid`;
  try {
    await signInOwner(page);
    await page.goto(`${APEX}/super-admin/signups`);
    const unitRow = page.getByRole("listitem", { name: unitName });
    await expect(unitRow.locator("span").getByText("New", { exact: true })).toBeVisible();

    // Follow up in three days, with a note.
    await unitRow.getByText("Manage").click();
    await unitRow.getByLabel("Status").selectOption("follow_up");
    const by = new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10);
    await unitRow.getByLabel("Follow up by").fill(by);
    await unitRow.getByLabel("Note").fill("Wants a call about patrols");
    await unitRow.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toContainText(`Saved ${unitName}`);
    await expect(unitRow.locator("span").getByText("Follow up", { exact: true })).toBeVisible();
    await expect(unitRow).toContainText("Wants a call about patrols");

    // Ask to pick a plan (an email, no charge), then give free access instead.
    await unitRow.getByText("Manage").click();
    await unitRow.getByRole("button", { name: "Ask to pick a plan" }).click();
    await expect(page.getByRole("status")).toContainText(`Asked signup-leader-${stamp}@example.invalid to pick a plan`);
    await unitRow.getByText("Manage").click();
    await unitRow.getByRole("button", { name: "Give free access" }).click();
    await expect(page.getByRole("status")).toContainText(`${unitName} is free until`);
    await expect(unitRow.locator("span").getByText("Free access", { exact: true })).toBeVisible();

    // The unit is Compass, so the Lantern filter hides it.
    await page.goto(`${APEX}/super-admin/signups?view=all&product=lantern`);
    await expect(page.getByRole("link", { name: unitName })).toHaveCount(0);
    await page.goto(`${APEX}/super-admin/signups?view=all&product=compass`);
    await expect(page.getByRole("link", { name: unitName })).toBeVisible();

    // Decline the account: it's turned off; approving turns it back on.
    await page.goto(`${APEX}/super-admin/signups`);
    const personRow = page.getByRole("listitem", { name: personName });
    await expect(personRow.getByText("email not confirmed")).toBeVisible();
    await personRow.getByText("Manage").click();
    await personRow.getByLabel("Decline reason").fill("Spam sign-up");
    await personRow.getByRole("button", { name: "Decline and turn off" }).click();
    await expect(page.getByRole("status")).toContainText(`Declined signup-person-${stamp}@example.invalid`);
    await expect(page.getByRole("link", { name: personName })).toHaveCount(0);
    expect((await db().user.findUniqueOrThrow({ where: { id: person.id } })).disabledAt).not.toBeNull();
    await page.goto(`${APEX}/super-admin/signups?view=declined`);
    await page.getByRole("button", { name: `Approve ${personName}` }).click();
    await expect(page.getByRole("status")).toContainText("turned it back on");
    expect((await db().user.findUniqueOrThrow({ where: { id: person.id } })).disabledAt).toBeNull();

    // Invite someone, and the resend guard.
    await page.getByLabel("Invite email").fill(inviteEmail);
    await page.getByLabel("Invite to").selectOption("waypoint");
    await page.getByRole("button", { name: "Send invite" }).click();
    await expect(page.getByRole("status")).toContainText(`Invited ${inviteEmail}`);
    await page.getByRole("button", { name: `Resend invite to ${inviteEmail}` }).click();
    await expect(page.getByRole("status")).toContainText("under a minute ago");

    await page.goto(`${APEX}/super-admin/audit`);
    await expect(page.getByText("signup.decline").first()).toBeVisible();
  } finally {
    await db().signupReview.deleteMany({ where: { entityId: { in: [org.id, person.id] } } });
    await db().ownerInvite.deleteMany({ where: { email: inviteEmail } });
    await db().org.delete({ where: { id: org.id } }).catch(() => {});
    await db().user.delete({ where: { id: person.id } }).catch(() => {});
  }
});

test("usage shows what a unit made and marks it active", async ({ page }) => {
  const name = `Usage E2E Troop ${stamp}`;
  const org = await db().org.create({
    data: {
      slug: `usage-e2e-${stamp}`,
      unitType: "Troop",
      unitNumber: "5432",
      displayName: name,
      charterOrg: "Test Church",
      city: "Anytown",
      state: "MN",
      scoutmasterName: "Usage Leader",
      scoutmasterEmail: `usage-leader-${stamp}@example.invalid`,
    },
  });
  try {
    await db().event.create({ data: { orgId: org.id, title: "Campout", startsAt: new Date(Date.now() + 5 * DAY) } });
    const channel = await db().channel.create({ data: { orgId: org.id, kind: "troop", name: "Troop" } });
    await db().message.create({ data: { channelId: channel.id, body: "See you Saturday" } });

    await signInOwner(page);
    await expect(page.getByText("Active units, last 30 days")).toBeVisible();
    await page.goto(`${APEX}/super-admin/usage?state=active`);
    const row = page.getByRole("row", { name: new RegExp(name) });
    await expect(row.getByText("Active", { exact: true })).toBeVisible();
    await page.goto(`${APEX}/super-admin/usage?state=dormant`);
    await expect(page.getByRole("link", { name })).toHaveCount(0);

    await page.goto(`${APEX}/super-admin/orgs/${org.slug}`);
    const usage = page.locator("section", { has: page.getByRole("heading", { name: "Usage, last 30 days" }) });
    await expect(usage).toContainText("Chat messages1");
    await expect(usage).toContainText("Events coming up1");
  } finally {
    await db().org.delete({ where: { id: org.id } }).catch(() => {});
  }
});
