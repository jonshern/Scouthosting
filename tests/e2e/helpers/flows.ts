// Shared helpers for the end-to-end flow specs (events, slots,
// permission slips, roles, youth protection, link crawl).
//
// Everything a user can do through the UI is done through the UI. The
// only direct database writes are for state the app has no screen for
// yet (granting an org role, sign-up slots, ad-hoc chat channels) and
// are kept in ./db.ts so they are easy to spot.

import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { deleteEvents, eventIdByTitle } from "./db";
import { E2E_PORT } from "./ports";

export const APEX = `http://localhost:${E2E_PORT}`;
export const TENANT = `http://troop100.localhost:${E2E_PORT}`;
export const ORG_SLUG = "troop100";
export const ADMIN_EMAIL = "scoutmaster@example.invalid";
export const ADMIN_PASSWORD = "AdminPasswordTest123!";
export const USER_PASSWORD = "CorrectHorseBatteryStaple!";

/** Short unique suffix so parallel/re-run data never collides. */
export function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * A start time a couple of hours out. The public calendar lists only the
 * next 50 upcoming events (no paging), and other specs create events a
 * day or more ahead, so near-term events always make the list.
 */
export function soon(): Date {
  return new Date(Date.now() + (120 + Math.floor(Math.random() * 120)) * 60_000);
}

/** `<input type="datetime-local">` value for a Date, in local time. */
export function isoLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/**
 * /login leads with passkeys and folds email + password behind "Use email
 * and password instead"; unfold it.
 */
export async function showPasswordSignIn(page: Page): Promise<void> {
  const form = page.locator("details#password-sign-in");
  await form.waitFor({ state: "attached" });
  if ((await form.getAttribute("open")) === null) await form.locator("summary").click();
}

/**
 * Sign in on a host (tenant by default). The login form has a
 * honeypot dwell-time check, hence the wait before submitting.
 */
export async function signIn(
  page: Page,
  email = ADMIN_EMAIL,
  password = ADMIN_PASSWORD,
  host = TENANT,
): Promise<void> {
  await page.goto(`${host}/login`);
  await showPasswordSignIn(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Create an account through /signup on the tenant host; leaves the page signed in. */
export async function signUp(
  page: Page,
  displayName: string,
  email: string,
  password = USER_PASSWORD,
  host = TENANT,
): Promise<void> {
  await page.goto(`${host}/signup`);
  await page.getByLabel("Your name").fill(displayName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByLabel(/18 or older/).check();
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /create account/i }).click();
  await skipPasskeyPrompt(page);
}

/** New accounts are offered a passkey first (/account/passkey); skip it. */
export async function skipPasskeyPrompt(page: Page): Promise<void> {
  await page.waitForURL(/\/account\/passkey/);
  await page.getByRole("link", { name: "Skip for now" }).click();
  await page.waitForURL((u) => u.pathname !== "/account/passkey");
}

/** A fresh, isolated browser context + page (separate cookie jar). */
export async function freshPage(
  browser: Browser,
  options: Parameters<Browser["newContext"]>[0] = {},
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext(options);
  const page = await ctx.newPage();
  return { ctx, page };
}

export type NewMember = {
  firstName: string;
  lastName: string;
  email: string;
  isYouth: boolean;
  patrol?: string;
  /** Emails of adult roster members to link as parents/guardians. */
  parentEmails?: string[];
};

/** Admin adds a roster member via /admin/members (Scouts tab form). */
export async function addMember(page: Page, m: NewMember): Promise<void> {
  await page.goto(`${TENANT}/admin/members`);
  const form = page.locator("form").filter({ has: page.locator("#firstName") });
  await form.locator("#firstName").fill(m.firstName);
  await form.locator("#lastName").fill(m.lastName);
  await form.locator("#email").fill(m.email);
  const youth = form.locator("#isYouth");
  if (m.isYouth) await youth.check();
  else await youth.uncheck();
  if (m.patrol) await form.locator("#patrol").fill(m.patrol);
  for (const parentEmail of m.parentEmails ?? []) {
    await form.getByPlaceholder(/search adults/i).fill(parentEmail);
    const row = form.locator("li").filter({ hasText: parentEmail });
    await row.getByRole("checkbox").check();
  }
  // We're already on /admin/members, so wait for the server action's
  // response rather than a URL change.
  await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/admin/members"),
    ),
    form.getByRole("button", { name: /add member/i }).click(),
  ]);
  await expect(form.locator('[role="alert"]')).toHaveCount(0);
}

export type NewEvent = {
  title: string;
  startsAt: Date;
  location?: string;
  requiresPermissionSlip?: boolean;
};

/** Admin creates an event via /admin/events/new; returns its id. */
export async function createEvent(page: Page, e: NewEvent): Promise<string> {
  await page.goto(`${TENANT}/admin/events/new`);
  await page.getByLabel("Title").fill(e.title);
  await page.getByLabel("Starts at").fill(isoLocal(e.startsAt));
  if (e.location) await page.getByLabel("Location name").fill(e.location);
  if (e.requiresPermissionSlip) await page.locator("#requiresPermissionSlip").check();
  await page.getByRole("button", { name: /create event/i }).click();
  await page.waitForURL(/\/admin\/events$/);
  // The admin list shows the 50 latest-starting events, which other
  // specs' far-future events can crowd out; look the new row up by title.
  const id = await eventIdByTitle(e.title);
  createdEventIds.push(id);
  return id;
}

const createdEventIds: string[] = [];

/**
 * Delete the events this worker created via createEvent. The public
 * calendar only lists the next 50 upcoming events, so leftovers from
 * repeated local runs would crowd other specs' events off it.
 */
export async function cleanupCreatedEvents(): Promise<void> {
  await deleteEvents(createdEventIds.splice(0));
}

/** The <li> card for an event on the public list calendar. */
export function calendarCard(page: Page, eventId: string) {
  return page.locator(`li#event-${eventId}`);
}

/** Submit the RSVP form on an event card (calendar must already be open). */
export async function rsvpOnCalendar(
  page: Page,
  eventId: string,
  response: "yes" | "no" | "maybe",
  guest?: { name: string; email: string },
): Promise<void> {
  const card = calendarCard(page, eventId);
  await card.locator("summary", { hasText: /^RSVP$/ }).click();
  const form = card.locator("form").filter({ has: page.locator('select[name="response"]') });
  if (guest) {
    await form.locator('input[name="name"]').fill(guest.name);
    await form.locator('input[name="email"]').fill(guest.email);
  }
  await form.locator('select[name="response"]').selectOption(response);
  await form.getByRole("button", { name: /submit rsvp/i }).click();
  await expect(form.getByText("Thanks — your RSVP was recorded.")).toBeVisible();
}
