import { expect, test } from "@playwright/test";

test.describe("apex marketing", () => {
  test("home page renders the hero and CTAs", async ({ page }) => {
    await page.goto("/");
    // Magazine-cover hero per design-handoff/marketing-balanced.jsx —
    // headline is "Modern, secure software for your scouting unit."
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /modern.*secure software.*scouting unit/i,
    );
    await expect(
      page.getByRole("link", { name: /start.*free trial/i }).first(),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
  });

  test("plans page lists Standard and Premium tiers", async ({ page }) => {
    await page.goto("/plans");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/two flavors/i);
    for (const name of ["Standard", "Premium"]) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }
    // 30-day free trial chip is present.
    await expect(page.getByText(/30 days free/i).first()).toBeVisible();
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
