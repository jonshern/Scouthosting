// Role-based access: admin and leader get the admin console; parent,
// scout and a signed-in outsider are refused every /admin page; members
// (any role) see members-only content that the public and outsiders
// don't.
//
// Org roles are granted in the DB (helpers/db.ts#grantRole) because the
// app has no screen for it.

import { expect, test, type Browser, type Page } from "@playwright/test";
import { TENANT, freshPage, signIn, signUp, uid } from "./helpers/flows";
import { grantRole } from "./helpers/db";

const ADMIN_PATHS = [
  "/admin",
  "/admin/members",
  "/admin/members?tab=adults",
  "/admin/events",
  "/admin/events/new",
  "/admin/email",
  "/admin/treasury",
  "/admin/permission-slips",
  "/admin/channels",
  "/admin/dm",
  "/admin/audit",
  "/admin/security",
  "/admin/site",
];

type Role = "admin" | "leader" | "parent" | "scout" | "none";

async function userWithRole(browser: Browser, role: Role): Promise<{ page: Page; close: () => Promise<void> }> {
  const { ctx, page } = await freshPage(browser);
  const email = `${role}-${uid()}@example.invalid`;
  await signUp(page, `Role ${role}`, email);
  if (role !== "none") await grantRole(email, role, { yptCurrent: role === "leader" });
  return { page, close: () => ctx.close() };
}

async function expectDenied(page: Page, path: string) {
  await page.goto(`${TENANT}${path}`);
  await expect(page.getByRole("heading", { name: "Not authorized" }), path).toBeVisible();
  // None of the admin chrome or data leaks into the rendered page.
  await expect(page.getByRole("heading", { name: /coming up/i })).toHaveCount(0);
  await expect(page.getByText("avery@example.invalid")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /send broadcast|create event|add member/i })).toHaveCount(0);
}

test.describe("roles + access control", () => {
  test("signed-out visitors are sent to login from every admin page", async ({ page }) => {
    for (const path of ADMIN_PATHS) {
      await page.goto(`${TENANT}${path}`);
      await expect(page, path).toHaveURL(/\/login/);
    }
  });

  for (const role of ["parent", "scout", "none"] as const) {
    test(`${role === "none" ? "signed-in outsider" : role} is denied every admin page`, async ({ browser }) => {
      test.setTimeout(90_000);
      const u = await userWithRole(browser, role);
      for (const path of ADMIN_PATHS) await expectDenied(u.page, path);
      await u.close();
    });
  }

  test("leader and admin reach the admin console", async ({ page, browser }) => {
    await signIn(page);
    await page.goto(`${TENANT}/admin`);
    await expect(page.getByRole("heading", { name: /coming up/i })).toBeVisible();
    await page.goto(`${TENANT}/admin/members?tab=adults`);
    await expect(page.getByText("avery@example.invalid")).toBeVisible();

    const leader = await userWithRole(browser, "leader");
    await leader.page.goto(`${TENANT}/admin`);
    await expect(leader.page.getByRole("heading", { name: /coming up/i })).toBeVisible();
    await leader.page.goto(`${TENANT}/admin/events/new`);
    await expect(leader.page.getByRole("button", { name: /create event/i })).toBeVisible();
    await leader.close();
  });

  test("members-only post: visible to parent and scout, hidden from public and outsiders", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    await signIn(page);
    await page.goto(`${TENANT}/admin/posts`);
    const title = `Members-only ${uid()}`;
    await page.getByLabel("Title (optional)").fill(title);
    await page.getByLabel("Body").fill("For unit families only.");
    await page.locator("#visibility").selectOption("members");
    // Already on /admin/posts: wait for the server action, not a URL change.
    await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/admin/posts"),
      ),
      page.getByRole("button", { name: /publish post/i }).click(),
    ]);

    await page.goto(`${TENANT}/posts`);
    await expect(page.getByText(title)).toBeVisible();

    for (const role of ["parent", "scout"] as const) {
      const u = await userWithRole(browser, role);
      await u.page.goto(`${TENANT}/posts`);
      await expect(u.page.getByText(title), role).toBeVisible();
      await u.close();
    }

    const outsider = await userWithRole(browser, "none");
    await outsider.page.goto(`${TENANT}/posts`);
    await expect(outsider.page.getByText(title)).toHaveCount(0);
    await outsider.close();

    const anon = await freshPage(browser);
    await anon.page.goto(`${TENANT}/posts`);
    await expect(anon.page.getByText(title)).toHaveCount(0);
    await anon.ctx.close();
  });
});
