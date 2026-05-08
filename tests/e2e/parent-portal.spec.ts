// /account/my-scouts and /account/my-stuff. /account routes are
// apex-served — sign in on the apex (relative paths resolve against
// baseURL = http://localhost:3000) so the cookie is set for the
// apex host.

import { expect, test, type Page } from "@playwright/test";

const EMAIL = "scoutmaster@example.invalid";
const PASSWORD = "AdminPasswordTest123!";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/);
}

test.describe("parent portal", () => {
  test("my-scouts + my-stuff render for a signed-in user", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page);

    await page.goto("/account/my-scouts");
    await expect(
      page.getByRole("heading", { name: /my scouts/i }),
    ).toBeVisible();
    const empty = page.getByText(/we couldn['’]t find any scouts/i);
    const card = page.locator("article");
    await expect(empty.or(card.first())).toBeVisible();

    await page.goto("/account/my-stuff");
    await expect(
      page.getByRole("heading", { name: /my stuff/i }),
    ).toBeVisible();
    const stuffCard = page.locator("input[name=skills]").first();
    const stuffEmpty = page.getByText(/didn['’]t find any roster row/i);
    await expect(stuffCard.or(stuffEmpty)).toBeVisible();
  });
});
