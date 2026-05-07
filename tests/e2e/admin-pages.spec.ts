// Smoke-coverage: every newly-ported admin page renders without
// throwing for a leader user. One sign-in per describe (single test
// case sweeps every page) so we don't blow past the per-IP login
// rate limit (30/min).

import { expect, test, type Page } from "@playwright/test";

const EMAIL = "scoutmaster@example.invalid";
const PASSWORD = "AdminPasswordTest123!";
const TENANT = "http://troop100.localhost:3000";

const ADMIN_PAGES: Array<[string, RegExp]> = [
  // The redesigned overview h1 is the day-of-week greeting; anchor on
  // the always-present "What's coming up." h2 instead.
  ["/admin", /troop|pack|crew|ship|post|admin|overview|coming up/i],
  ["/admin/announcements", /announcements/i],
  ["/admin/events", /events/i],
  ["/admin/members", /members/i],
  ["/admin/members/import", /roster import/i],
  ["/admin/pages", /pages/i],
  ["/admin/photos", /photo/i],
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
  ["/admin/car-rides", /car rides/i],
  ["/admin/refunds", /refunds/i],
  ["/admin/domain", /custom domain/i],
  ["/admin/forms/new", /new form/i],
  ["/admin/refunds/new", /issue refund/i],
  ["/admin/surveys", /surveys/i],
  ["/admin/surveys/new", /new survey/i],
];

test.describe("admin smoke coverage", () => {
  test("every admin page renders for a signed-in leader", async ({ page }: { page: Page }) => {
    test.setTimeout(180_000);

    await page.goto(`${TENANT}/login`);
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.waitForTimeout(1700);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(`${TENANT}/`);

    for (const [path, headingRe] of ADMIN_PAGES) {
      await page.goto(`${TENANT}${path}`);
      await expect(
        page.locator("body"),
        `body for ${path} contains "Application error"`,
      ).not.toContainText("Application error");
      await expect(
        page.getByRole("heading", { name: headingRe }).first(),
        `heading match for ${path}`,
      ).toBeVisible();
    }
  });
});
