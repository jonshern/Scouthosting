// Mobile API: event detail + RSVP submit, end-to-end.

import { expect, test, type Page } from "@playwright/test";

const EMAIL = "scoutmaster@example.invalid";
const PASSWORD = "AdminPasswordTest123!";
const TENANT = "http://troop100.localhost:3000";

async function signInTenant(page: Page) {
  await page.goto(`${TENANT}/login`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/);
}

async function mintToken(page: Page): Promise<string> {
  await page.goto("http://localhost:3000/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Apex login redirects leaders straight to their org's /admin
  // (or to /select-org if they're in many). The seeded scoutmaster
  // is only in troop100 so they land on /o/troop100/admin.
  await page.waitForURL(/\/(admin|select-org)/);
  const res = await page.request.post("http://localhost:3000/api/v1/auth/token", {
    data: { name: "RSVP-flow test" },
  });
  const body = (await res.json()) as { raw: string };
  return body.raw;
}

test.describe("mobile RSVP", () => {
  test("admin creates an event, mobile API shows it, RSVP submit succeeds", async ({ page }) => {
    await signInTenant(page);
    await page.goto(`${TENANT}/admin/events/new`);
    const title = `Mobile RSVP test ${Date.now()}`;
    await page.getByLabel("Title").fill(title);
    const startsAt = new Date(Date.now() + 86_400_000);
    const isoLocal = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
        d.getHours(),
      )}:${pad(d.getMinutes())}`;
    };
    await page.getByLabel("Starts at").fill(isoLocal(startsAt));
    await page.getByRole("button", { name: /create event/i }).click();
    await page.waitForURL(/\/admin\/events$/);

    // Mint a token and pull the event list.
    const token = await mintToken(page);
    const list = await page.request.get(
      "http://localhost:3000/api/v1/orgs/troop100/events",
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(list.status()).toBe(200);
    const { events } = (await list.json()) as {
      events: Array<{ id: string; title: string }>;
    };
    const ev = events.find((e) => e.title === title);
    expect(ev).toBeDefined();

    // RSVP submit.
    const rsvp = await page.request.post(
      `http://localhost:3000/api/v1/events/${ev!.id}/rsvp`,
      {
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        data: { response: "yes", guests: 2 },
      },
    );
    expect(rsvp.status()).toBe(200);
    const rsvpBody = (await rsvp.json()) as { rsvp: { response: string } };
    expect(rsvpBody.rsvp.response).toBe("yes");
  });
});
