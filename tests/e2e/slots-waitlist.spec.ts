// Sign-up slots: capacity, waitlist and no overbooking, driven through
// the public calendar by separate signed-out visitors.
//
// Most slots are created in the DB (helpers/db.ts#createSlot) to keep
// the specs fast; the no-waitlist test adds its slot through the event's
// admin page.

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  APEX,
  TENANT,
  USER_PASSWORD,
  calendarCard,
  cleanupCreatedEvents,
  createEvent,
  freshPage,
  signIn,
  soon,
  signUp,
  uid,
} from "./helpers/flows";
import { createSlot, db, grantRole } from "./helpers/db";

function slotItem(page: Page, eventId: string, slotTitle: string) {
  return calendarCard(page, eventId).locator("li").filter({ hasText: slotTitle });
}

async function guestClaim(
  browser: Browser,
  eventId: string,
  slotTitle: string,
  guest: { name: string; email: string },
): Promise<string> {
  const { ctx, page } = await freshPage(browser);
  await page.goto(`${TENANT}/calendar`);
  const item = slotItem(page, eventId, slotTitle);
  await item.locator("summary").click();
  const form = item.locator("form");
  await form.locator('input[name="name"]').fill(guest.name);
  await form.locator('input[name="email"]').fill(guest.email);
  await form.locator('button[type="submit"]').click();
  const outcome = form.locator("p").filter({
    hasText: /Signed up — thanks!|Added to the waitlist|full|already signed up/i,
  });
  await expect(outcome).toBeVisible();
  const text = (await outcome.textContent()) ?? "";
  await ctx.close();
  return text;
}

test.describe("sign-up slots", () => {
  test.afterAll(cleanupCreatedEvents);

  test("fills to capacity, then waitlists; never overbooks", async ({ page, browser }) => {
    await signIn(page);
    const eventId = await createEvent(page, {
      title: `E2E slots ${uid()}`,
      startsAt: soon(),
    });
    const slotTitle = `Drivers ${uid()}`;
    const slotId = await createSlot({ eventId, title: slotTitle, capacity: 2, allowWaitlist: true });

    await page.goto(`${TENANT}/calendar`);
    await expect(slotItem(page, eventId, slotTitle)).toContainText("0 / 2 filled");
    await expect(slotItem(page, eventId, slotTitle).locator("summary")).toHaveText("Sign up");

    const a = `a-${uid()}@example.invalid`;
    expect(await guestClaim(browser, eventId, slotTitle, { name: "Ann", email: a })).toContain(
      "Signed up",
    );
    expect(
      await guestClaim(browser, eventId, slotTitle, { name: "Ben", email: `b-${uid()}@example.invalid` }),
    ).toContain("Signed up");

    await page.reload();
    const item = slotItem(page, eventId, slotTitle);
    await expect(item).toContainText("2 / 2 filled");
    await expect(item.locator("summary")).toHaveText("Join waitlist");

    // Third person: waitlisted, not seated.
    expect(
      await guestClaim(browser, eventId, slotTitle, { name: "Cal", email: `c-${uid()}@example.invalid` }),
    ).toContain("Added to the waitlist");
    // Same email twice is refused.
    expect(await guestClaim(browser, eventId, slotTitle, { name: "Ann again", email: a })).toMatch(
      /already signed up/i,
    );

    await page.reload();
    await expect(item).toContainText("2 / 2 filled · 1 on waitlist");

    const rows = await db().slotAssignment.findMany({ where: { slotId } });
    expect(rows.filter((r) => !r.waitlisted)).toHaveLength(2);
    expect(rows.filter((r) => r.waitlisted).map((r) => r.name)).toEqual(["Cal"]);
  });

  test("slot without a waitlist refuses sign-ups once full", async ({ page, browser }) => {
    await signIn(page);
    const eventId = await createEvent(page, {
      title: `E2E slot no-waitlist ${uid()}`,
      startsAt: soon(),
    });
    const slotTitle = `Snacks ${uid()}`;
    // Added by hand on the event's admin page.
    await page.goto(`${TENANT}/admin/events/${eventId}`);
    await page.getByRole("link", { name: /sign-up slots/i }).click();
    await page.getByLabel("Slot", { exact: true }).fill(slotTitle);
    await page.getByLabel("Spots").fill("1");
    await page.getByLabel("Start a waitlist when it fills").uncheck();
    await page.getByRole("button", { name: "Add slot" }).click();
    await expect(page.getByText(`Added “${slotTitle}”.`)).toBeVisible();
    await expect(page.locator("#slots table")).toContainText(slotTitle);
    await expect(page.locator("#slots table tr").filter({ hasText: slotTitle })).toContainText("0 / 1");

    // Two visitors open the calendar while the seat is still free...
    const first = await freshPage(browser);
    const second = await freshPage(browser);
    for (const p of [first.page, second.page]) {
      await p.goto(`${TENANT}/calendar`);
      await slotItem(p, eventId, slotTitle).locator("summary").click();
    }
    const fill = async (p: Page, name: string) => {
      const form = slotItem(p, eventId, slotTitle).locator("form");
      await form.locator('input[name="name"]').fill(name);
      await form.locator('input[name="email"]').fill(`${name.toLowerCase()}-${uid()}@example.invalid`);
      await form.locator('button[type="submit"]').click();
      return form;
    };
    // ...the first takes it and is told so (not "full"); the second,
    // with a stale page, is refused.
    await fill(first.page, "Dee");
    await expect(slotItem(first.page, eventId, slotTitle)).toContainText("1 / 1 filled");
    await expect(slotItem(first.page, eventId, slotTitle)).toContainText("Signed up — thanks!");
    await expect(slotItem(first.page, eventId, slotTitle)).not.toContainText("This slot is full.");
    const f2 = await fill(second.page, "Eli");
    await expect(f2.getByRole("alert")).toHaveText("This slot is full.");
    await first.ctx.close();
    await second.ctx.close();

    await page.goto(`${TENANT}/calendar`);
    const item = slotItem(page, eventId, slotTitle);
    await expect(item).toContainText("1 / 1 filled");
    await expect(item.locator("summary")).toHaveText("Slot full");
  });

  test("simultaneous claims for the last seat exactly one person", async ({ page, browser }) => {
    await signIn(page);
    const eventId = await createEvent(page, {
      title: `E2E slot race ${uid()}`,
      startsAt: soon(),
    });
    const slotTitle = `Last seat ${uid()}`;
    const slotId = await createSlot({ eventId, title: slotTitle, capacity: 1, allowWaitlist: false });

    const visitors = await Promise.all([1, 2, 3, 4].map(() => freshPage(browser)));
    const forms: Locator[] = [];
    for (const [i, v] of visitors.entries()) {
      await v.page.goto(`${TENANT}/calendar`);
      const item = slotItem(v.page, eventId, slotTitle);
      await item.locator("summary").click();
      const form = item.locator("form");
      await form.locator('input[name="name"]').fill(`Racer ${i}`);
      await form.locator('input[name="email"]').fill(`racer${i}-${uid()}@example.invalid`);
      forms.push(form);
    }
    await Promise.all(forms.map((f) => f.locator('button[type="submit"]').click()));
    // Losers get an inline "full" error; the winner's card refreshes to
    // the full state (and shows no error).
    await expect
      .poll(async () => {
        const counts = await Promise.all(
          forms.map((f) => f.getByRole("alert").filter({ hasText: "This slot is full." }).count()),
        );
        return counts.reduce((a, b) => a + b, 0);
      })
      .toBe(3);
    for (const v of visitors) {
      await v.page.reload();
      await expect(slotItem(v.page, eventId, slotTitle)).toContainText("1 / 1 filled");
    }
    for (const v of visitors) await v.ctx.close();
    expect(await db().slotAssignment.count({ where: { slotId } })).toBe(1);
  });

  test("cancelling a seat promotes the first waitlisted person (phone app API)", async ({ page, browser }) => {
    test.setTimeout(90_000);
    await signIn(page);
    const eventId = await createEvent(page, {
      title: `E2E slot promote ${uid()}`,
      startsAt: soon(),
    });
    const slotTitle = `Grill ${uid()}`;
    const slotId = await createSlot({ eventId, title: slotTitle, capacity: 1, allowWaitlist: true });

    // Two unit families, each signed in to the phone app (bearer token).
    type Family = { name: string; ctx: BrowserContext; page: Page; token: string };
    const families: Family[] = [];
    for (const name of ["Fay", "Gus"]) {
      const email = `${name.toLowerCase()}-${uid()}@example.invalid`;
      const { ctx, page: p } = await freshPage(browser);
      await signUp(p, `${name} Family`, email, USER_PASSWORD, APEX);
      await grantRole(email, "parent");
      const token = await p.evaluate(async () => {
        const r = await fetch("/api/v1/auth/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "E2E phone" }),
        });
        return ((await r.json()) as { raw: string }).raw;
      });
      families.push({ name, ctx, page: p, token });
    }
    const call = (f: Family, action: "take" | "release") =>
      f.page.evaluate(
        async ({ url, token }: { url: string; token: string }) => {
          const r = await fetch(url, {
            method: "POST",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: "{}",
          });
          return { status: r.status, body: await r.json() };
        },
        { url: `/api/v1/events/${eventId}/slots/${slotId}/${action}`, token: f.token },
      );

    const [fay, gus] = families;
    expect(await call(fay, "take")).toEqual({ status: 200, body: { ok: true, waitlisted: false } });
    expect(await call(gus, "take")).toEqual({ status: 200, body: { ok: true, waitlisted: true } });
    // Taking again is idempotent, not a second seat.
    expect((await call(gus, "take")).body).toEqual({ ok: true, waitlisted: true });

    await page.goto(`${TENANT}/calendar`);
    await expect(slotItem(page, eventId, slotTitle)).toContainText("1 / 1 filled · 1 on waitlist");

    expect(await call(fay, "release")).toEqual({ status: 200, body: { ok: true, released: true } });
    await page.reload();
    const item = slotItem(page, eventId, slotTitle);
    await expect(item).toContainText("1 / 1 filled");
    await expect(item).not.toContainText("on waitlist");

    const rows = await db().slotAssignment.findMany({ where: { slotId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Gus Family", waitlisted: false });

    // Releasing a seat you don't hold is a no-op.
    expect(await call(fay, "release")).toEqual({ status: 200, body: { ok: true, released: false } });
    for (const f of families) await f.ctx.close();
  });
});
