import { expect, test } from "@playwright/test";

const SEEDED_EMAIL = "scoutmaster@example.invalid";
const SEEDED_PASSWORD = "AdminPasswordTest123!";

async function login(page: import("@playwright/test").Page) {
  await page.goto("http://troop100.localhost:3000/login");
  await page.getByLabel("Email").fill(SEEDED_EMAIL);
  await page.getByLabel("Password").fill(SEEDED_PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/");
}

test.describe("group email", () => {
  test("dry run reports recipient counts without sending", async ({ page }) => {
    await login(page);
    await page.goto("http://troop100.localhost:3000/admin/email");
    await page.getByLabel("Subject").fill("Pack reminder");
    await page.getByLabel("Body").fill("Bring water bottles tomorrow.");
    await page.locator("#audienceKind").selectOption("everyone");
    await page.locator("#dryRun").check();
    await page.getByRole("button", { name: /send broadcast/i }).click();
    const status = page.getByRole("status");
    await expect(status).toContainText(/Would send to/);
    // Seed has 5 members; one is unsubscribed. Eligible = 4.
    await expect(status).toContainText(/4/);
  });

  test("real send delivers via the console driver and lands in MailLog", async ({ page }) => {
    await login(page);
    await page.goto("http://troop100.localhost:3000/admin/email");
    const subject = `E2E broadcast ${Date.now()}`;
    await page.getByLabel("Subject").fill(subject);
    await page.getByLabel("Body").fill("Hello world.\n\nVisit https://example.com");
    await page.locator("#audienceKind").selectOption("adults");
    // Don't check dryRun
    await page.getByRole("button", { name: /send broadcast/i }).click();
    await expect(page.getByRole("status")).toContainText(/Sent to/);
    // MailLog row appears in the list
    await page.reload();
    await expect(page.getByText(subject)).toBeVisible();
  });

  test("audience=patrol filters to the chosen patrol", async ({ page }) => {
    await login(page);
    await page.goto("http://troop100.localhost:3000/admin/email");
    await page.getByLabel("Subject").fill("Eagles patrol meeting");
    await page.getByLabel("Body").fill("Eagles only.");
    await page.locator("#audienceKind").selectOption("patrol");
    await page.locator("#audiencePatrol").selectOption("Eagles");
    await page.locator("#dryRun").check();
    await page.getByRole("button", { name: /send broadcast/i }).click();
    // Eagles patrol has 2 youth in the seed (Casey + Dale).
    await expect(page.getByRole("status")).toContainText(/Would send to 2 recipients/);
  });

  test("non-leader (no membership) sees Not authorized", async ({ browser }) => {
    // Cookies are host-scoped (no COOKIE_DOMAIN in test env), so we must
    // sign up on the tenant subdomain — the apex session won't carry over.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("http://troop100.localhost:3000/signup");
    await page.getByLabel("Your name").fill("No Role");
    await page.getByLabel("Email").fill(`norole+${Date.now()}@example.invalid`);
    await page.getByLabel("Password").fill("CorrectHorseBatteryStaple!");
    await page.waitForTimeout(1700);
    await page.getByRole("button", { name: /create account/i }).click();
    await page.waitForURL("**/");
    // Now visit the tenant admin — signed in but no membership
    await page.goto("http://troop100.localhost:3000/admin/email");
    await expect(page.getByRole("heading", { level: 1, name: /not authorized/i })).toBeVisible();
    await ctx.close();
  });
});
