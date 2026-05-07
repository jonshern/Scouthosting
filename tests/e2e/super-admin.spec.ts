import { expect, test, type Page } from "@playwright/test";

const EMAIL = "scoutmaster@example.invalid";
const PASSWORD = "AdminPasswordTest123!";

async function signInApex(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/);
}

test.describe("super-admin", () => {
  test("redirects non-super-admin to /login (or away from /super-admin)", async ({ page }) => {
    await signInApex(page);
    await page.goto("/super-admin");
    // The seeded scoutmaster is admin of troop100 but NOT isSuperAdmin.
    // Layout redirects to /login?next=/super-admin.
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects unsigned users away from /super-admin", async ({ page }) => {
    await page.goto("/super-admin");
    await expect(page).toHaveURL(/\/login/);
  });
});
