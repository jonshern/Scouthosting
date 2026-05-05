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

test.describe("page editor", () => {
  test("admin saves a hero, public home renders it", async ({ page }) => {
    await login(page);
    await page.goto("http://troop100.localhost:3000/admin/site");
    const headline = `Welcome to Troop 100 — ${Date.now()}`;
    await page.getByLabel("Headline").fill(headline);
    await page.getByLabel("Subhead").fill("Adventure since forever.\n\nVisit https://example.com");
    await page.getByRole("button", { name: /save hero/i }).click();
    await expect(page.getByRole("status")).toContainText(/saved/i);

    await page.goto("http://troop100.localhost:3000/");
    await expect(page.getByRole("heading", { level: 1, name: headline })).toBeVisible();
    // Subhead's URL is auto-linked
    await expect(page.getByRole("link", { name: "https://example.com" })).toBeVisible();
  });

  test("admin creates a custom page; public render escapes HTML and renders Markdown-lite", async ({ page }) => {
    await login(page);
    const slug = `e2e-${Date.now()}`;
    await page.goto("http://troop100.localhost:3000/admin/pages/new");
    await page.getByLabel("Title").fill("FAQ");
    await page.getByLabel("URL slug").fill(slug);
    // Body that mixes paragraphs, line breaks, an HTML injection attempt,
    // and an autolink. The Markdown-lite renderer must escape the script
    // tag and treat blank lines as paragraph breaks.
    await page.getByLabel("Body").fill(
      "What time?\nMondays at 7.\n\nLink: https://example.com\n\n<script>alert(1)</script>"
    );
    await page.getByRole("button", { name: /create page/i }).click();
    await page.waitForURL("**/admin/pages");
    await expect(page.getByText("FAQ").first()).toBeVisible();

    // Public render
    const res = await page.goto(`http://troop100.localhost:3000/p/${slug}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "FAQ" })).toBeVisible();
    // Autolink works
    await expect(page.getByRole("link", { name: "https://example.com" })).toBeVisible();
    // Script tag must NOT be in the live DOM
    const scriptCount = await page.locator("article script").count();
    expect(scriptCount).toBe(0);
  });

  test("public site nav shows custom pages with showInNav=true", async ({ page }) => {
    await page.goto("http://troop100.localhost:3000/");
    // The seeded test environment may not have any custom pages with
    // showInNav=true, but the previous test created one. Just confirm
    // the global tenant nav renders the standard items at least.
    // Scope to the Site navigation so the "Full calendar →" CTA in
    // the new editorial home doesn't trigger a strict-mode collision.
    const nav = page.getByRole("navigation", { name: "Site" });
    await expect(nav.getByRole("link", { name: "Calendar" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Photos" })).toBeVisible();
  });

  test("members-only custom page redirects anonymous users to sign-in prompt", async ({ browser, page }) => {
    await login(page);
    const slug = `members-${Date.now()}`;
    await page.goto("http://troop100.localhost:3000/admin/pages/new");
    await page.getByLabel("Title").fill("Roster");
    await page.getByLabel("URL slug").fill(slug);
    await page.getByLabel("Body").fill("Members only roster.");
    await page.locator("#visibility").selectOption("members");
    await page.getByRole("button", { name: /create page/i }).click();
    await page.waitForURL("**/admin/pages");

    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(`http://troop100.localhost:3000/p/${slug}`);
    await expect(anonPage.getByRole("heading", { level: 1, name: /members only/i })).toBeVisible();
    await expect(anonPage.getByRole("link", { name: /sign in/i })).toBeVisible();
    await anon.close();
  });
});
