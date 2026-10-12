// Permission slips end to end:
//   admin adds a parent + linked youth to the roster, creates an event
//   that requires a slip; the youth signs up and RSVPs yes; the admin
//   sees the slip outstanding and sends slips; the parent sees "Slip
//   needed" in My Scouts, opens the signing link, signs; status flips
//   to Signed for both the admin and the parent.
//
// The signing link normally arrives by email. The console mail driver
// doesn't log bodies, so the test mints the same signed token the
// dispatcher would put in the email (helpers/db.ts#mintPermSlipToken).

import { expect, test } from "@playwright/test";
import {
  APEX,
  TENANT,
  USER_PASSWORD,
  addMember,
  cleanupCreatedEvents,
  createEvent,
  freshPage,
  rsvpOnCalendar,
  signIn,
  soon,
  signUp,
  uid,
} from "./helpers/flows";
import { memberIdByEmail, mintPermSlipToken, orgId } from "./helpers/db";

test.describe("permission slips", () => {
  test.afterAll(cleanupCreatedEvents);

  test("issue → parent signs → status shows signed", async ({ page, browser }) => {
    test.setTimeout(120_000);
    const tag = uid();
    const parent = { first: "Pat", last: `Parent${tag}`, email: `parent-${tag}@example.invalid` };
    const youth = { first: "Sam", last: `Scout${tag}`, email: `scout-${tag}@example.invalid` };

    // Admin: roster + event.
    await signIn(page);
    await addMember(page, {
      firstName: parent.first,
      lastName: parent.last,
      email: parent.email,
      isYouth: false,
    });
    await addMember(page, {
      firstName: youth.first,
      lastName: youth.last,
      email: youth.email,
      isYouth: true,
      patrol: `Hawks${tag}`,
      parentEmails: [parent.email],
    });
    const title = `E2E campout ${tag}`;
    const eventId = await createEvent(page, {
      title,
      startsAt: soon(),
      location: "Camp Rotary",
      requiresPermissionSlip: true,
    });

    // Youth: own account, RSVP yes.
    const scoutSide = await freshPage(browser);
    await signUp(scoutSide.page, `${youth.first} ${youth.last}`, youth.email);
    await scoutSide.page.goto(`${TENANT}/calendar`);
    await rsvpOnCalendar(scoutSide.page, eventId, "yes");
    await scoutSide.ctx.close();

    // Admin: slip outstanding, then send.
    await page.goto(`${TENANT}/admin/events/${eventId}`);
    await page.getByRole("link", { name: /permission slips/i }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/events/${eventId}/permission-slips$`));
    await expect(page.getByText("0 of 1 signed")).toBeVisible();
    const row = page.locator("tbody tr").filter({ hasText: `${youth.first} ${youth.last}` });
    await expect(row).toContainText("Outstanding");
    await page.getByRole("button", { name: /send slips to parents/i }).click();
    await expect(page.getByText("Sent 1 email for 1 scout.")).toBeVisible();

    // Org-wide overview lists the event as needing slips.
    await page.goto(`${TENANT}/admin/permission-slips`);
    await expect(page.getByText(title).first()).toBeVisible();

    // Parent: account, My Scouts shows the slip is needed.
    const parentSide = await freshPage(browser);
    const pp = parentSide.page;
    await signUp(pp, `${parent.first} ${parent.last}`, parent.email);
    // /account lives on the apex and cookies are host-scoped.
    await signIn(pp, parent.email, USER_PASSWORD, APEX);
    await pp.goto(`${APEX}/account/my-scouts`);
    const card = pp.locator("article").filter({ hasText: `${youth.first} ${youth.last}` });
    const eventRow = card.locator("li").filter({ hasText: title });
    await expect(eventRow).toContainText("RSVP yes");
    await expect(eventRow).toContainText("Slip needed");

    // Parent: open the emailed link and sign.
    const token = mintPermSlipToken({
      orgId: await orgId(),
      eventId,
      memberId: await memberIdByEmail(youth.email),
      parentEmail: parent.email,
      parentName: `${parent.first} ${parent.last}`,
    });
    await pp.goto(`${APEX}/permission-slip/${token}`);
    await expect(pp.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(pp.getByText(`For: ${youth.first} ${youth.last}`)).toBeVisible();
    await expect(pp.getByLabel("Type your full name to sign")).toHaveValue(
      `${parent.first} ${parent.last}`,
    );
    await pp.getByLabel(/anything the leaders should know/i).fill("Peanut allergy");
    await pp.getByRole("button", { name: /sign permission slip/i }).click();
    await expect(pp).toHaveURL(/\?signed=1$/);
    await expect(pp.getByRole("heading", { name: /signed — thank you/i })).toBeVisible();

    await pp.goto(`${APEX}/account/my-scouts`);
    await expect(eventRow).toContainText("Slip signed");
    await parentSide.ctx.close();

    // Admin: status flipped.
    await page.goto(`${TENANT}/admin/events/${eventId}/permission-slips`);
    await expect(page.getByText("1 of 1 signed")).toBeVisible();
    await expect(row).toContainText("Signed");
    await expect(row).toContainText(`${parent.first} ${parent.last}`);
  });

  test("a link for someone who isn't the scout's parent can't sign", async ({ page, browser }) => {
    const tag = uid();
    const youthEmail = `lone-scout-${tag}@example.invalid`;
    await signIn(page);
    await addMember(page, {
      firstName: "Lone",
      lastName: `Scout${tag}`,
      email: youthEmail,
      isYouth: true,
    });
    const eventId = await createEvent(page, {
      title: `E2E slip guard ${tag}`,
      startsAt: soon(),
      requiresPermissionSlip: true,
    });

    const token = mintPermSlipToken({
      orgId: await orgId(),
      eventId,
      memberId: await memberIdByEmail(youthEmail),
      parentEmail: `stranger-${tag}@example.invalid`,
      parentName: "Stranger",
    });
    const { ctx, page: anon } = await freshPage(browser);
    await anon.goto(`${APEX}/permission-slip/${token}`);
    await anon.getByRole("button", { name: /sign permission slip/i }).click();
    await expect(anon.getByText(/no longer linked to this scout/i)).toBeVisible();
    await expect(anon.getByRole("button", { name: /sign permission slip/i })).toBeVisible();
    await ctx.close();

    await page.goto(`${TENANT}/admin/events/${eventId}/permission-slips`);
    await expect(page.getByText("No yes-RSVP youths yet.")).toBeVisible();
  });

  test("a tampered token shows the expired page", async ({ page }) => {
    await page.goto(`${APEX}/permission-slip/not-a-real-token`);
    await expect(page.getByRole("heading", { name: /link expired or invalid/i })).toBeVisible();
  });
});
