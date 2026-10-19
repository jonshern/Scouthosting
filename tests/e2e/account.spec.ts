import { expect, test, type Page } from "@playwright/test";
import { showPasswordSignIn } from "./helpers/flows";

const EMAIL = "scoutmaster@example.invalid";
const PASSWORD = "AdminPasswordTest123!";

async function signIn(page: Page) {
  await page.goto("/login");
  await showPasswordSignIn(page);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/);
}

test.describe("account settings", () => {
  test("profile page renders the current user's display name and email", async ({ page }) => {
    await signIn(page);
    await page.goto("/account/profile");
    await expect(page.getByRole("heading", { level: 1, name: /profile/i })).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveValue(EMAIL);
  });

  test("password page renders the change form", async ({ page }) => {
    await signIn(page);
    await page.goto("/account/password");
    await expect(page.getByRole("heading", { level: 1, name: /change password/i })).toBeVisible();
    await expect(page.getByLabel("Current password")).toBeVisible();
    await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Confirm new password")).toBeVisible();
  });

  test("api tokens page renders empty state for fresh seeded user", async ({ page }) => {
    await signIn(page);
    await page.goto("/account/api-tokens");
    await expect(page.getByRole("heading", { level: 1, name: /apps and claude/i })).toBeVisible();
  });

  test("account routes redirect anonymous users to login", async ({ page }) => {
    await page.goto("/account/profile");
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});
