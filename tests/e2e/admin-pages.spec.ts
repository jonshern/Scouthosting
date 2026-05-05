// Smoke-coverage: every newly-ported admin page renders without
// throwing for a leader user. Doesn't exhaustively test interactions
// — that's per-feature spec. This is the "did the page route at all"
// safety net.

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
  await page.waitForURL(`${TENANT}/`);
}

const ADMIN_PAGES: Array<[string, RegExp]> = [
  ["/admin", /troop|pack|crew|ship|post|admin|overview/i],
  ["/admin/announcements", /announcements/i],
  ["/admin/events", /events/i],
  ["/admin/members", /members/i],
  ["/admin/members/import", /roster import/i],
  ["/admin/pages", /pages/i],
  ["/admin/photos", /photos/i],
  ["/admin/posts", /posts/i],
  ["/admin/email", /email|broadcast/i],
  ["/admin/site", /site/i],
  ["/admin/channels", /channels/i],
  ["/admin/dm", /direct messages|dm/i],
  ["/admin/newsletters", /newsletters/i],
  ["/admin/newsletters/schedule", /schedule/i],
  ["/admin/trips", /trip planner/i],
  ["/admin/forms", /forms/i],
  ["/admin/reimbursements", /reimbursements/i],
  ["/admin/eagle", /eagle/i],
  ["/admin/training", /training/i],
  ["/admin/coh", /court/i],
  ["/admin/oa", /order of the arrow/i],
  ["/admin/merit-badge-counselors", /merit badge counselors/i],
];

test.describe("admin smoke coverage", () => {
  for (const [path, headingRe] of ADMIN_PAGES) {
    test(`renders ${path}`, async ({ page }) => {
      await signInTenant(page);
      await page.goto(`${TENANT}${path}`);
      // Either the heading shows up, or "Not authorized" — but a 500
      // / runtime exception means the test fails.
      await expect(
        page.locator("body"),
      ).not.toContainText("Application error");
      await expect(page.getByRole("heading", { name: headingRe }).first()).toBeVisible();
    });
  }
});
