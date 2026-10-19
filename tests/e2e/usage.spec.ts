// Usage tracking: a signed-out visit to Compass lands in UsageEvent
// without any cookie of its own, and the owner console's analytics page
// shows it. Waypoint's and Lantern's screen views (posted the way their
// web apps post them) show under their product; nothing from a scout is
// kept. The owner's own console pages aren't counted.

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
  await expect(page.getByRole("heading", { name: /Visits and actions/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign-up funnel" })).toBeVisible();
  // The campaign tag from the visit above (top pages can be crowded by the rest of the suite).
  await expect(page.getByText("e2e", { exact: true }).first()).toBeVisible();
  expect(await db().usageEvent.count({ where: { path: { startsWith: "/super-admin" }, createdAt: { gte: since } } })).toBe(0);
});

// What Waypoint's and Lantern's apps send (bluecard app/src/lib/usage.ts,
// emmett-scouting app/src/lib/usage-core.ts).
async function postUsage(page: Page, body: unknown) {
  return page.evaluate(async (b) => {
    const r = await fetch("/api/v1/usage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    return r.status;
  }, body);
}

test("Waypoint and Lantern screen views show under their product; nothing from a scout", async ({ page }) => {
  // Paths are cleaned of anything id-like, so each view carries this run's
  // tag as its campaign tag instead.
  const tag = `e2e${Date.now().toString(36)}`;
  const view = (path: string) => ({ name: "view", path, source: tag });
  await page.goto(`${APEX}/start`);
  expect(await postUsage(page, { product: "waypoint", platform: "web", events: [view("/plans")] })).toBe(200);
  expect(await postUsage(page, { product: "lantern", platform: "web", events: [view("/trail")] })).toBe(200);
  // Lantern outside grown-up mode says role "scout": answered, not kept.
  expect(await postUsage(page, { product: "lantern", platform: "web", role: "scout", events: [view("/scout")] })).toBe(200);
  await expect
    .poll(async () => (await db().usageEvent.findMany({ where: { source: tag }, select: { product: true, path: true } })).map((r) => `${r.product} ${r.path}`).sort())
    .toEqual(["lantern /trail", "waypoint /plans"]);

  await signInOwner(page);
  for (const product of ["waypoint", "lantern"]) {
    await page.goto(`${APEX}/super-admin/analytics?days=1&product=${product}`);
    await expect(page.getByText(tag, { exact: true }).first()).toBeVisible();
  }
});
