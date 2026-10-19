// Polish checks across the app, mostly at phone size:
//  - no page scrolls sideways on a 390px-wide phone
//  - every page has one h1 and a tab title of its own
//  - account pages share one nav; sign-up steps don't show it
//  - forms that still use the older `input` class get the field look
//  - a post's paragraphs keep their spacing (the .prose styles)
//  - 404s say what's missing, and download links aren't prefetched

import { expect, test, type Page } from "@playwright/test";
import { ADMIN_EMAIL, APEX, TENANT, signIn, uid } from "./helpers/flows";

const PHONE = { width: 390, height: 844 };
const UNIT = "Sample Troop 100";

async function noSidewaysScroll(page: Page, url: string): Promise<void> {
  const res = await page.goto(url);
  expect(res?.status(), url).toBeLessThan(400);
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
  }));
  expect(scroll, `${url} is ${scroll}px wide on a ${width}px phone`).toBeLessThanOrEqual(width + 1);
  await expect(page.locator("h1").first(), url).toBeVisible();
}

test.describe("phone size", () => {
  test.use({ viewport: PHONE });

  test("main site pages fit a phone", async ({ page }) => {
    for (const path of ["/", "/plans", "/security", "/positioning", "/pitch", "/start", "/login", "/signup", "/contact"]) {
      await noSidewaysScroll(page, `${APEX}${path}`);
    }
  });

  test("a unit's public site fits a phone", async ({ page }) => {
    for (const path of ["/", "/calendar", "/photos", "/posts", "/login"]) {
      await noSidewaysScroll(page, `${TENANT}${path}`);
    }
  });

  test("chat, admin and account pages fit a phone", async ({ page }) => {
    await signIn(page);
    for (const path of [
      "/chat",
      "/admin",
      "/admin/events",
      "/admin/events/new",
      "/admin/members",
      "/admin/members/import",
      "/admin/announcements",
      "/admin/email",
      "/admin/photos",
      "/admin/forms/new",
      "/admin/surveys/new",
      "/admin/treasury",
      "/admin/refunds/new",
      "/admin/setup",
      "/admin/billing",
    ]) {
      await noSidewaysScroll(page, `${TENANT}${path}`);
    }
    await signIn(page, ADMIN_EMAIL, undefined, APEX);
    for (const path of ["/account/profile", "/account/security", "/account/password", "/account/my-scouts", "/account/api-tokens"]) {
      await noSidewaysScroll(page, `${APEX}${path}`);
    }
  });

  test("the owner console fits a phone", async ({ page }) => {
    await signIn(page, "super@example.invalid", undefined, APEX);
    for (const path of ["/super-admin", "/super-admin/orgs", "/super-admin/people", "/super-admin/billing", "/super-admin/usage", "/super-admin/signups", "/super-admin/inbox", "/super-admin/errors"]) {
      await noSidewaysScroll(page, `${APEX}${path}`);
    }
  });
});

test.describe("tab titles", () => {
  test("unit, admin, account and owner pages name themselves", async ({ page }) => {
    await page.goto(`${TENANT}/calendar`);
    await expect(page).toHaveTitle(`Calendar — ${UNIT}`);
    await signIn(page);
    await page.goto(`${TENANT}/admin/members`);
    await expect(page).toHaveTitle(`Members · Admin — ${UNIT}`);
    await page.goto(`${TENANT}/admin/treasury/ledger`);
    await expect(page).toHaveTitle(`Ledger · Admin — ${UNIT}`);

    await signIn(page, ADMIN_EMAIL, undefined, APEX);
    await page.goto(`${APEX}/account/profile`);
    await expect(page).toHaveTitle("Profile — Compass");

    await signIn(page, "super@example.invalid", undefined, APEX);
    await page.goto(`${APEX}/super-admin/usage`);
    await expect(page).toHaveTitle("Usage — Owner console");
  });
});

test.describe("account pages", () => {
  test("one nav reaches every account page and marks where you are", async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, undefined, APEX);
    await page.goto(`${APEX}/account/profile`);
    const nav = page.getByRole("navigation", { name: "Account" });
    const pages: [string, RegExp][] = [
      ["Sign-in and security", /Sign-in and security/],
      ["Password", /Change password/],
      ["My scouts", /My scouts/],
      ["My stuff", /My stuff/],
      ["Lantern trails", /Lantern trails/],
      ["Apps and Claude", /Apps and Claude/],
      ["Delete account", /Delete account/],
      ["Profile", /Profile/],
    ];
    for (const [link, heading] of pages) {
      await nav.getByRole("link", { name: link, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(nav.getByRole("link", { name: link, exact: true })).toHaveAttribute("aria-current", "page");
    }
  });

  test("older form inputs get the field look", async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, undefined, APEX);
    await page.goto(`${APEX}/account/password`);
    const input = page.getByLabel("Current password");
    await expect(input).toHaveCSS("border-top-width", "1px");
    await expect(input).toHaveCSS("min-height", "42px");
  });
});

test("a post's paragraphs keep their spacing", async ({ page }) => {
  await signIn(page);
  await page.goto(`${TENANT}/admin/posts`);
  const title = `Spacing ${uid()}`;
  await page.getByLabel("Title (optional)").fill(title);
  await page.getByLabel("Body").fill("First paragraph.\n\nSecond paragraph.");
  await page.getByRole("button", { name: /publish post/i }).click();
  await page.waitForURL("**/admin/posts");
  await page.goto(`${TENANT}/posts`);
  await page.getByRole("link", { name: title }).click();
  const second = page.locator(".prose p", { hasText: "Second paragraph." });
  await expect(second).toBeVisible();
  const gap = await second.evaluate((el) => parseFloat(getComputedStyle(el).marginTop));
  expect(gap).toBeGreaterThan(8);
});

test.describe("not found", () => {
  test("a missing page on the main site", async ({ page }) => {
    const res = await page.goto(`${APEX}/no-such-page`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  });

  test("a missing page on a unit's site", async ({ page }) => {
    const res = await page.goto(`${TENANT}/no-such-page`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  });

  test("a unit that doesn't exist", async ({ page }) => {
    const res = await page.goto("http://troop999.localhost:3000/");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Site not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Start a site" })).toHaveAttribute("href", `${APEX}/start`);
  });
});

test("CSV download links aren't prefetched", async ({ page }) => {
  await signIn(page);
  const csv: string[] = [];
  page.on("request", (r) => {
    if (/\.csv(\?|$)/.test(new URL(r.url()).pathname)) csv.push(r.url());
  });
  await page.goto(`${TENANT}/admin/reports`, { waitUntil: "networkidle" });
  await page.goto(`${TENANT}/admin/treasury/reports`, { waitUntil: "networkidle" });
  expect(csv).toEqual([]);
});
