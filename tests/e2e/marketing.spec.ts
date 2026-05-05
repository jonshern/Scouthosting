import { expect, test } from "@playwright/test";

test.describe("apex marketing", () => {
  test("home page renders the hero and CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("One hub");
    await expect(page.getByRole("link", { name: "Start a site" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
  });

  test("plans page lists three tiers", async ({ page }) => {
    await page.goto("/plans");
    await expect(page.getByRole("heading", { name: "Pricing", level: 1 })).toBeVisible();
    for (const name of ["Patrol", "Troop", "Council"]) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }
  });

  test("security page lists trust pillars", async ({ page }) => {
    await page.goto("/security");
    await expect(page.getByRole("heading", { level: 1, name: /security/i })).toBeVisible();
    await expect(page.getByText(/Two-deep leadership/i)).toBeVisible();
    await expect(page.getByText(/MFA for leaders/i)).toBeVisible();
  });

  test("pitch and positioning render", async ({ page }) => {
    await page.goto("/pitch");
    await expect(page.getByRole("heading", { level: 1, name: /About Compass/ })).toBeVisible();
    await page.goto("/positioning");
    await expect(page.getByRole("heading", { level: 1, name: /Why Compass/ })).toBeVisible();
  });

  test("404 for unknown apex paths", async ({ page }) => {
    const res = await page.goto("/this-does-not-exist", { waitUntil: "networkidle" });
    expect(res?.status()).toBe(404);
  });

  test("health endpoint returns ok", async ({ request }) => {
    const res = await request.get("/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
