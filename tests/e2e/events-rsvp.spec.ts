// Events end to end: admin creates an event, members and guests RSVP
// yes / no from the public calendar (desktop and phone viewport), the
// admin sees the RSVPs roll up, and the event appears in the list,
// month grid and iCal views of the calendar.

import { devices, expect, test } from "@playwright/test";
import {
  TENANT,
  calendarCard,
  cleanupCreatedEvents,
  createEvent,
  freshPage,
  rsvpOnCalendar,
  signIn,
  soon,
  uid,
} from "./helpers/flows";

test.describe("events + RSVP", () => {
  test.afterAll(cleanupCreatedEvents);

  test("admin RSVPs yes, then changes to no; the event page tracks the change", async ({ page }) => {
    await signIn(page);
    const title = `E2E RSVP yes-no ${uid()}`;
    const id = await createEvent(page, {
      title,
      startsAt: soon(),
      location: "Scout hall",
    });

    await page.goto(`${TENANT}/calendar`);
    await expect(calendarCard(page, id)).toContainText(title);
    await rsvpOnCalendar(page, id, "yes");

    await page.goto(`${TENANT}/admin/events/${id}`);
    await expect(page.getByText("1 RSVPs · 1 yes")).toBeVisible();
    const row = page.locator("tbody tr").filter({ hasText: "scoutmaster@example.invalid" });
    await expect(row.locator("td").nth(2)).toHaveText("yes");

    // Changing the answer updates the same RSVP instead of adding one.
    await page.goto(`${TENANT}/calendar`);
    await rsvpOnCalendar(page, id, "no");
    await page.goto(`${TENANT}/admin/events/${id}`);
    await expect(page.getByText("1 RSVPs · 0 yes")).toBeVisible();
    await expect(row.locator("td").nth(2)).toHaveText("no");

  });

  test("guest RSVPs from a phone; duplicate guest RSVP is refused", async ({ page, browser }) => {
    await signIn(page);
    const title = `E2E mobile RSVP ${uid()}`;
    const id = await createEvent(page, {
      title,
      startsAt: soon(),
    });

    const { ctx, page: phone } = await freshPage(browser, { ...devices["iPhone 13"] });
    // Phone viewport, touch and UA (the engine stays chromium).
    await phone.goto(`${TENANT}/calendar`);
    const viewport = phone.viewportSize();
    expect(viewport?.width).toBeLessThan(500);
    const guestEmail = `guest-${uid()}@example.invalid`;
    await rsvpOnCalendar(phone, id, "no", { name: "Gale Guest", email: guestEmail });

    // Page must not scroll sideways on a phone.
    const overflow = await phone.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "horizontal overflow on phone viewport (px)").toBeLessThanOrEqual(1);

    // Second guest RSVP with the same email can't overwrite the first.
    await phone.reload();
    const card = calendarCard(phone, id);
    await card.locator("summary", { hasText: /^RSVP$/ }).click();
    const form = card.locator("form").filter({ has: phone.locator('select[name="response"]') });
    await form.locator('input[name="name"]').fill("Someone Else");
    await form.locator('input[name="email"]').fill(guestEmail);
    await form.locator('select[name="response"]').selectOption("yes");
    await form.getByRole("button", { name: /submit rsvp/i }).click();
    await expect(form.getByRole("alert")).toContainText(/already an RSVP for this email/i);
    await ctx.close();

    await page.goto(`${TENANT}/admin/events/${id}`);
    await expect(page.getByText("1 RSVPs · 0 yes")).toBeVisible();
    const row = page.locator("tbody tr").filter({ hasText: guestEmail });
    await expect(row.locator("td").nth(0)).toHaveText("Gale Guest");
    await expect(row.locator("td").nth(2)).toHaveText("no");
  });

  test("new event shows on the list calendar, the month grid and the iCal feed", async ({ page }) => {
    await signIn(page);
    const title = `E2E calendar views ${uid()}`;
    // Early morning, so it's the first of the day's events in the month
    // grid (a cell shows three, then "+N more").
    const startsAt = new Date(Date.now() + 86_400_000);
    startsAt.setHours(0, 5, 0, 0); // tomorrow 00:05, at most ~24h out
    const id = await createEvent(page, { title, startsAt });

    // Month grid for the event's month links back to the list card.
    const ym = `${startsAt.getFullYear()}-${String(startsAt.getMonth() + 1).padStart(2, "0")}`;
    await page.goto(`${TENANT}/calendar?view=month&ym=${ym}`);
    const cell = page.locator(`a[href$="#event-${id}"]`);
    await expect(cell).toContainText(title);
    await cell.click();
    await expect(calendarCard(page, id)).toBeVisible();

    // Signed-out visitors see it too.
    await page.context().clearCookies();
    await page.goto(`${TENANT}/calendar`);
    await expect(calendarCard(page, id)).toContainText(title);

    const ical = await page.evaluate(async () => {
      const r = await fetch("/calendar.ical");
      return r.text();
    });
    expect(ical).toContain(`SUMMARY:${title}`);
  });
});
