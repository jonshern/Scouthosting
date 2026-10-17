// Waypoint's badge day sign-ups end to end: a leader pastes the Waypoint
// event file on the event's admin page, then a family's sign-up from
// Waypoint's public page (POST /api/events/<slug>/signups) is saved.

import { expect, test } from "@playwright/test";
import { APEX, TENANT, cleanupCreatedEvents, createEvent, signIn, soon, uid } from "./helpers/flows";
import { db } from "./helpers/db";

test.afterAll(cleanupCreatedEvents);

test("an imported Waypoint event takes public sign-ups", async ({ page, request }) => {
  const id = uid();
  const slug = `2026-11-14-tech-fair-${id}`;
  await signIn(page);
  // Created without "Sign-up required": importing the file has to turn it on.
  const eventId = await createEvent(page, { title: `Tech Fair ${id}`, startsAt: soon() });
  await page.goto(`${TENANT}/admin/events/${eventId}`);
  const file = {
    title: "Tech Fair",
    date: "2026-11-14",
    blocks: [{ id: "A", label: "Morning rotation" }],
    stations: [{ id: "robotics-a", badge: "Robotics", block: "A", capacity: 1 }],
    volunteerRoles: [{ id: "checkin", label: "Check-in table", need: 2 }],
  };
  await page.locator("#slot-file-pick").setInputFiles({ name: `${slug}.json`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file)) });
  await page.getByRole("button", { name: "Import stations and roles" }).click();
  await expect(page.getByText("Imported: 2 new, 0 updated.")).toBeVisible();
  await expect(page.getByText(`Public slug: ${slug}.`, { exact: false })).toBeVisible();
  await expect(page.getByText("Sign-up required is now on")).toBeVisible();

  const signUp = (email: string) =>
    request.post(`${APEX}/api/events/${slug}/signups`, {
      data: { eventSlug: slug, guardian: { name: "Pat R.", email }, scoutName: "Alex R.", stationIds: ["robotics-a"], volunteerRoles: [] },
    });
  const first = await signUp(`pat-${id}@example.test`);
  expect(first.status(), await first.text()).toBe(200);
  expect(await first.json()).toMatchObject({ status: "confirmed" });
  // The one seat is gone, so the next family waits.
  const second = await signUp(`sam-${id}@example.test`);
  expect(second.status(), await second.text()).toBe(200);
  expect(await second.json()).toMatchObject({ status: "waitlisted", waitlistedStationIds: ["robotics-a"] });

  const slot = await db().signupSlot.findFirstOrThrow({ where: { eventId, key: "station:robotics-a" }, select: { id: true } });
  expect(await db().slotAssignment.count({ where: { slotId: slot.id } })).toBe(2);
});
