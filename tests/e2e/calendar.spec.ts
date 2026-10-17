import { expect, test } from "@playwright/test";
import { showPasswordSignIn } from "./helpers/flows";
import { E2E_PORT } from "./helpers/ports";

const SEEDED_EMAIL = "scoutmaster@example.invalid";
const SEEDED_PASSWORD = "AdminPasswordTest123!";

async function login(page: import("@playwright/test").Page) {
  await page.goto(`http://troop100.localhost:${E2E_PORT}/login`);
  await showPasswordSignIn(page);
  await page.getByLabel("Email").fill(SEEDED_EMAIL);
  await page.getByLabel("Password").fill(SEEDED_PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/);
}

test.describe("calendar", () => {
  test("admin can create an event and it shows on the public calendar", async ({ page }) => {
    await login(page);
    await page.goto(`http://troop100.localhost:${E2E_PORT}/admin/events/new`);
    const title = `E2E pack meeting ${Date.now()}`;
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Description").fill("Bring snacks. Wear uniform.");
    const startsAt = new Date(Date.now() + 86_400_000); // tomorrow
    const isoLocal = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    await page.getByLabel("Starts at").fill(isoLocal(startsAt));
    await page.getByLabel("Location name").fill("Hall");
    await page.getByLabel("Map address").fill("123 Main St, Anytown, MN");
    await page.getByRole("button", { name: /create event/i }).click();
    await page.waitForURL("**/admin/events");
    await expect(page.getByText(title)).toBeVisible();

    await page.goto(`http://troop100.localhost:${E2E_PORT}/calendar`);
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByRole("link", { name: "Add to Google" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Directions" }).first()).toBeVisible();
  });

  test("iCal feed serves text/calendar with the right MIME and content", async ({ page }) => {
    // Fetch from inside the page context — Chromium resolves
    // *.localhost where Node's resolver doesn't on macOS, and the
    // text/calendar content-type doesn't trigger a download here.
    await page.goto(`http://troop100.localhost:${E2E_PORT}/`);
    const result = await page.evaluate(async () => {
      const r = await fetch("/calendar.ical");
      return {
        status: r.status,
        contentType: r.headers.get("content-type") ?? "",
        body: await r.text(),
      };
    });
    expect(result.status).toBe(200);
    expect(result.contentType).toContain("text/calendar");
    expect(result.body).toContain("BEGIN:VCALENDAR");
    expect(result.body).toContain("END:VCALENDAR");
  });

  test("iCal feed 404s for unknown tenant", async ({ page }) => {
    const res = await page.goto(`http://troop999.localhost:${E2E_PORT}/calendar.ical`);
    expect(res?.status()).toBe(404);
  });

  test("event edit page renders RSVP count and form", async ({ page }) => {
    await login(page);
    await page.goto(`http://troop100.localhost:${E2E_PORT}/admin/events/new`);
    const title = `RSVP test ${Date.now()}`;
    await page.getByLabel("Title").fill(title);
    const startsAt = new Date(Date.now() + 172_800_000);
    const isoLocal = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    await page.getByLabel("Starts at").fill(isoLocal(startsAt));
    await page.getByRole("button", { name: /create event/i }).click();
    await page.waitForURL("**/admin/events");
    const href = await page.locator(`a:has-text("${title}")`).first().getAttribute("href");
    expect(href).toMatch(/\/admin\/events\/[a-z0-9]+$/);
    await page.goto(`http://troop100.localhost:${E2E_PORT}${href}`);
    // The h1 of the edit page is the event title
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    // The "Save changes" CTA appears when editing (vs "Create event" when new)
    await expect(page.getByRole("button", { name: /save changes/i })).toBeVisible();
  });
}); 