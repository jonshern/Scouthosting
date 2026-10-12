// Links and redirects that depend on which host a page is served on:
// apex (localhost) vs a troop host (troop100.localhost).

import { expect, request, test } from "@playwright/test";
import { APEX, ORG_SLUG, TENANT, signIn } from "./helpers/flows";

test.describe("host-aware links and redirects", () => {
  test("phone sign-in redirects use a relative Location", async () => {
    const api = await request.newContext();
    const res = await api.get(`${APEX}/auth/mobile/begin?redirect=compass://auth/callback`, {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(307);
    const location = res.headers()["location"] ?? "";
    // Never an absolute URL built from the bind address (http://0.0.0.0:3000/…).
    expect(location).toMatch(/^\/login\?next=/);
    await api.dispose();
  });

  test("the admin avatar's /account link works on a troop host", async ({ page }) => {
    await signIn(page);
    const res = await page.goto(`${TENANT}/account`);
    expect(res?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(`${TENANT}/account/profile`);
  });

  test("main-site links on a troop host's /login point at the main site", async ({ page }) => {
    await page.goto(`${TENANT}/login`);
    const footer = page.locator("footer");
    // An absolute link to the apex (the suite runs with NODE_ENV=production,
    // so it is https://localhost with no port).
    const apex = /^https?:\/\/localhost(:\d+)?/.source;
    await expect(footer.getByRole("link", { name: "Pricing" })).toHaveAttribute("href", new RegExp(`${apex}/plans$`));
    await expect(footer.getByRole("link", { name: "About" })).toHaveAttribute("href", new RegExp(`${apex}/pitch$`));
    await page.goto(`${APEX}/login`);
    await expect(page.locator("footer").getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/plans");
  });

  test("troop nav links fit the host: bare on the troop host, /o/<slug> on the apex", async ({ page }) => {
    await page.goto(`${TENANT}/`);
    const tenantNav = page.getByRole("navigation", { name: "Site" });
    await expect(tenantNav.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/calendar");

    await page.goto(`${APEX}/o/${ORG_SLUG}`);
    const apexNav = page.getByRole("navigation", { name: "Site" });
    await expect(apexNav.getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "href",
      `/o/${ORG_SLUG}/calendar`,
    );
    const res = await page.goto(`${APEX}/o/${ORG_SLUG}/calendar`);
    expect(res?.status()).toBeLessThan(400);
  });
});
