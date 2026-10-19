// Usage tracking: a signed-out visit to Compass lands in UsageEvent
// without any cookie of its own, and the owner console's usage page
// shows it. The owner's own console pages aren't counted.

import { expect, test, type Page } from "@playwright/test";
import { db } from "./helpers/db";
import { APEX, showPasswordSignIn } from "./helpers/flows";

const OWNER_EMAIL = "super@example.invalid";
const PASSWORD = "AdminPasswordTest123!";

async function signInOwner(page: Page) {
  await page.goto(`${APEX}/login`);
  await showPasswordSignIn(page);
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/super-admin/);
}

test("a visit shows on the owner console's usage page", async ({ page, context }) => {
  const since = new Date();
  await page.goto(`${APEX}/start?utm_source=e2e`);
  await expect
    .poll(() => db().usageEvent.count({ where: { product: "compass", path: "/start", source: "e2e", createdAt: { gte: since } } }))
    .toBe(1);
  const row = await db().usageEvent.findFirstOrThrow({ where: { path: "/start", source: "e2e", createdAt: { gte: since } } });
  expect(row.role).toBe("visitor");
  expect(row.visitorHash).toMatch(/^[0-9a-f]{32}$/);
  // Tracking sets no cookie: the only ones are Compass's own.
  const names = (await context.cookies()).map((c) => c.name);
  expect(names.filter((n) => /usage|visitor|_ga|track/i.test(n))).toEqual([]);

  await signInOwner(page);
  await page.goto(`${APEX}/super-admin/analytics?days=1&product=compass`);
  await expect(page.getByRole("heading", { name: /Usage/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign-up funnel" })).toBeVisible();
  // The campaign tag from the visit above (top pages can be crowded by the rest of the suite).
  await expect(page.getByText("e2e", { exact: true }).first()).toBeVisible();
  expect(await db().usageEvent.count({ where: { path: { startsWith: "/super-admin" }, createdAt: { gte: since } } })).toBe(0);
});
