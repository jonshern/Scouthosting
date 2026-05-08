// CRUD coverage for content surfaces: events, posts, announcements.
//
// Note on what's *not* covered here:
//   - Event delete: there's no admin UI to delete events (the
//     `deleteEvent` server action exists but isn't wired to a button)
//     so we only verify create + edit.
//   - Post/announcement delete: same — no UI.

import { expect, test, type Page } from "@playwright/test";

const EMAIL = "scoutmaster@example.invalid";
const PASSWORD = "AdminPasswordTest123!";
const TENANT = "http://troop100.localhost:3000";

async function signIn(page: Page) {
  await page.goto(`${TENANT}/login`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/);
}

test.describe("crud coverage – content", () => {
  test("events / posts / announcements", async ({ page }) => {
    test.setTimeout(240_000);
    await signIn(page);

    // ── Events: create + edit ────────────────────────────────────────
    const eventTitle = `E2E Event ${Date.now()}`;
    const eventTitleEdited = `${eventTitle} (edited)`;
    // Pick a future date so the list view sorts it where we can find it.
    const future = new Date(Date.now() + 30 * 86400_000);
    // datetime-local format: YYYY-MM-DDTHH:mm
    const startsAt = `${future.toISOString().slice(0, 10)}T18:00`;

    await page.goto(`${TENANT}/admin/events/new`);
    await page.locator("input#title").fill(eventTitle);
    await page.locator("input[name=startsAt]").fill(startsAt);
    await page.getByRole("button", { name: /create event/i }).click();
    // EventForm `redirect()`s to `/o/<slug>/admin/events` after a
    // successful upsert.
    await page.waitForURL(/\/admin\/events$/, { timeout: 30_000 });
    await expect(
      page.getByRole("link", { name: eventTitle }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Edit title.
    await page.getByRole("link", { name: eventTitle }).first().click();
    await page.waitForURL(/\/admin\/events\/[^/]+$/);
    await page.getByLabel("Title").fill(eventTitleEdited);
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.waitForTimeout(1_500);
    await page.goto(`${TENANT}/admin/events`);
    await expect(
      page.getByRole("link", { name: eventTitleEdited }).first(),
    ).toBeVisible();

    // ── Posts: create + edit ─────────────────────────────────────────
    const postTitle = `E2E Post ${Date.now()}`;
    const postTitleEdited = `${postTitle} (edited)`;

    await page.goto(`${TENANT}/admin/posts`);
    // PostForm has Title + Body.
    await page.locator("input#title").fill(postTitle);
    await page
      .locator("textarea[name=body]")
      .fill("Body content from CRUD coverage spec.");
    await page.getByRole("button", { name: /publish post/i }).click();
    await page.waitForTimeout(1_500);
    await page.goto(`${TENANT}/admin/posts`);
    await expect(
      page.getByRole("link", { name: postTitle }).first(),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: postTitle }).first().click();
    await page.waitForURL(/\/admin\/posts\/[^/]+$/);
    await page.locator("input#title").fill(postTitleEdited);
    await page.getByRole("button", { name: /save changes/i }).click();
    await page.waitForTimeout(1_500);
    await page.goto(`${TENANT}/admin/posts`);
    await expect(
      page.getByRole("link", { name: postTitleEdited }).first(),
    ).toBeVisible();

    // ── Announcements: create + appears on list ──────────────────────
    const annTitle = `E2E Ann ${Date.now()}`;

    await page.goto(`${TENANT}/admin/announcements`);
    await page.locator("input#title").fill(annTitle);
    await page
      .locator("textarea#body")
      .fill("Quick note from CRUD coverage spec.");
    await page.getByRole("button", { name: /post announcement|publish/i }).click();
    await page.waitForTimeout(1_500);
    await page.goto(`${TENANT}/admin/announcements`);
    await expect(page.getByText(annTitle).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
