// The three screens built after the TroopCampfire comparison:
// the public "Join our troop" form feeding the roster's Pending list,
// health form dates (member page, report, event warning), and the
// unit Advancement page with web sign-off.
//
// db() is used only for state with no screen: a scout marking a
// requirement done happens in Lantern, and an RSVP linked to the
// roster comes from a family's account.

import { expect, test } from "@playwright/test";
import { addMember, cleanupCreatedEvents, createEvent, signIn, TENANT, uid } from "./helpers/flows";
import { db, memberIdByEmail, orgId } from "./helpers/db";

const emails: string[] = [];

test.afterAll(async () => {
  await cleanupCreatedEvents();
  if (emails.length) {
    const oid = await orgId();
    const ids = (await db().member.findMany({ where: { orgId: oid, email: { in: emails } }, select: { id: true } })).map((m) => m.id);
    await db().member.deleteMany({ where: { orgId: oid, OR: [{ id: { in: ids } }, { parentIds: { hasSome: ids } }] } });
  }
});

test("a family sends Join our troop and it lands in Pending", async ({ browser }) => {
  test.setTimeout(90_000);
  const email = `join-${uid()}@example.invalid`;
  emails.push(email);

  const visitor = await browser.newContext();
  const page = await visitor.newPage();
  await page.goto(`${TENANT}/`);
  await page.getByRole("link", { name: /join our troop/i }).click();
  await expect(page.getByRole("heading", { name: /join our troop/i })).toBeVisible();
  await page.getByLabel("First name").fill("Pat");
  await page.getByLabel("Last name").fill("Joiner");
  await page.getByLabel("Email").fill(email);
  await page.locator("#scoutName").fill("Sam");
  await page.locator("#scoutAge").selectOption("11");
  await page.getByLabel(/anything we should know/i).fill("Can we visit Tuesday?");
  await page.waitForTimeout(1700); // honeypot dwell time
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Thanks, we got it.")).toBeVisible();
  await visitor.close();

  const lead = await db().member.findFirstOrThrow({ where: { orgId: await orgId(), email }, select: { id: true, status: true, prospectSource: true, isYouth: true } });
  expect(lead).toMatchObject({ status: "prospect", prospectSource: "web-form", isYouth: false });
  const scout = await db().member.findFirstOrThrow({ where: { parentIds: { has: lead.id } }, select: { status: true, isYouth: true, email: true } });
  expect(scout).toMatchObject({ status: "prospect", isYouth: true, email: null });

  const admin = await browser.newContext();
  const ap = await admin.newPage();
  await signIn(ap);
  await ap.goto(`${TENANT}/admin/members?tab=pending`);
  const row = ap.locator("tr").filter({ hasText: email });
  await expect(row).toContainText("Pat Joiner");
  await expect(row).toContainText("Join form");
  await expect(row).toContainText("Can we visit Tuesday?");
  await admin.close();
});

test("health form dates show on the member, the report and the event", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `health-${uid()}@example.invalid`;
  emails.push(email);
  await signIn(page);
  await addMember(page, { firstName: "Hana", lastName: "Forms", email, isYouth: true });
  const memberId = await memberIdByEmail(email);

  // Set parts A and B to today on the profile tab.
  await page.goto(`${TENANT}/admin/members/${memberId}`);
  const today = new Date().toISOString().slice(0, 10);
  await page.locator("#healthFormOn").fill(today);
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST"),
    page.getByRole("button", { name: /save changes/i }).click(),
  ]);
  await expect.poll(async () => (await db().member.findUniqueOrThrow({ where: { id: memberId }, select: { healthFormOn: true } })).healthFormOn?.toISOString().slice(0, 10)).toBe(today);

  await page.goto(`${TENANT}/admin/members/${memberId}?tab=medical`);
  await expect(page.getByText("Annual health form")).toBeVisible();
  await expect(page.getByText("Current").first()).toBeVisible();

  await page.goto(`${TENANT}/admin/reports`);
  await expect(page.getByRole("heading", { name: "Health forms" })).toBeVisible();
  const csv = await page.evaluate(async (url) => {
    const res = await fetch(url, { credentials: "include" });
    return { status: res.status, type: res.headers.get("content-type"), body: await res.text() };
  }, `${TENANT}/admin/reports/health-forms.csv`);
  expect(csv.status).toBe(200);
  expect(csv.type ?? "").toContain("text/csv");
  expect(csv.body).toContain("Hana Forms");

  // A 5-day trip needs the doctor's exam too, so Hana is flagged.
  const start = new Date(Date.now() + 14 * 86_400_000);
  const eventId = await createEvent(page, { title: `Summer camp ${uid()}`, startsAt: start });
  await db().event.update({ where: { id: eventId }, data: { endsAt: new Date(start.getTime() + 5 * 86_400_000) } });
  await db().rsvp.create({ data: { orgId: await orgId(), eventId, memberId, name: "Hana Forms", email, response: "yes" } });
  await page.goto(`${TENANT}/admin/events/${eventId}`);
  const warn = page.getByRole("status").filter({ hasText: /covered by a health form/ });
  await expect(warn).toContainText("1 of 1 going isn't covered");
  await expect(warn).toContainText("Hana Forms");
  await expect(warn).toContainText(/doctor's exam/i);
});

test("a leader signs off a waiting requirement on the Advancement page", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `adv-${uid()}@example.invalid`;
  emails.push(email);
  await signIn(page);
  await addMember(page, { firstName: "Avery", lastName: "Advance", email, isYouth: true, patrol: "Eagles" });
  const memberId = await memberIdByEmail(email);
  await db().requirementProgress.create({
    data: { orgId: await orgId(), memberId, requirementId: "rank:scout#1a", status: "done" },
  });

  await page.goto(`${TENANT}/admin/advancement`);
  await expect(page.getByRole("heading", { name: "Advancement", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Every scout" })).toBeVisible();
  const item = page.locator("#waiting li").filter({ hasText: "Avery Advance" });
  await expect(item).toContainText("Scout 1a");
  await item.getByRole("button", { name: "Sign off" }).click();
  await expect(page.getByText(/Signed off\./)).toBeVisible();
  const row = await db().requirementProgress.findFirstOrThrow({ where: { memberId, requirementId: "rank:scout#1a" } });
  expect(row.status).toBe("signed_off");
  expect(row.signedOffAt).not.toBeNull();

  // Patrol filter and spreadsheet.
  await page.getByRole("link", { name: "Eagles" }).click();
  await expect(page.locator("tbody")).toContainText("Avery Advance");
  const csv = await page.evaluate(async (url) => {
    const res = await fetch(url, { credentials: "include" });
    return { status: res.status, body: await res.text() };
  }, `${TENANT}/admin/advancement/advancement.csv?patrol=Eagles`);
  expect(csv.status).toBe(200);
  expect(csv.body).toContain("Avery Advance");
});
