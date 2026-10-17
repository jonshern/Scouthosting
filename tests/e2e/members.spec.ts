import { expect, test } from "@playwright/test";
import { showPasswordSignIn } from "./helpers/flows";
import { E2E_PORT } from "./helpers/ports";

const SEEDED_EMAIL = "scoutmaster@example.invalid";
const SEEDED_PASSWORD = "AdminPasswordTest123!";

async function login(page: import("@playwright/test").Page) {
  await page.goto(`http://troop100.localhost:${E2E_PORT}/login`);
  await showPasswordSignIn(page);
  await page.getByLabel("Email").fill(SEEDED_EMAIL);
  await page.getByLabel("Password").fill(SEEDED_PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/);
}

test.describe("members admin", () => {
  test("admin can add a new member and find them in the list", async ({ page }) => {
    await login(page);
    await page.goto(`http://troop100.localhost:${E2E_PORT}/admin/members`);
    const last = `Tester${Date.now()}`;
    await page.getByLabel("First name").fill("New");
    await page.getByLabel("Last name").fill(last);
    await page.getByLabel("Email").fill(`new+${Date.now()}@example.invalid`);
    await page.locator("#commPreference").selectOption("email");
    await page.getByRole("button", { name: /add member/i }).click();
    await page.waitForURL("**/admin/members");
    await expect(page.getByText(`New ${last}`)).toBeVisible();
  });

  test("search filters the roster", async ({ page }) => {
    await login(page);
    await page.goto(`http://troop100.localhost:${E2E_PORT}/admin/members?tab=adults&q=Avery`);
    await expect(page.getByText("Avery Adult")).toBeVisible();
    // Briar is not "Avery" — should be filtered out
    await expect(page.getByText("Briar Adult")).toHaveCount(0);
  });

  test("soft-delete moves a member to trash and restore brings them back", async ({ page }) => {
    await login(page);
    // Pick the seeded "Briar Adult" to bounce in/out of trash
    await page.goto(`http://troop100.localhost:${E2E_PORT}/admin/members?tab=adults&q=Briar`);
    await page.getByRole("link", { name: "Briar Adult" }).click();
    await page.getByRole("button", { name: /^remove$/i }).click();
    // The lifecycle button re-renders with the "Restore" label after the
    // soft-delete completes (revalidatePath fires; same URL).
    await expect(page.getByRole("button", { name: /^restore$/i })).toBeVisible();

    // Trash listing now contains Briar
    await page.goto(`http://troop100.localhost:${E2E_PORT}/admin/members?tab=adults&trash=1`);
    await expect(page.getByRole("link", { name: "Briar Adult" })).toBeVisible();

    // Restore from the edit page; back to active roster
    await page.getByRole("link", { name: "Briar Adult" }).click();
    await page.getByRole("button", { name: /^restore$/i }).click();
    await expect(page.getByRole("button", { name: /^remove$/i })).toBeVisible();
    await page.goto(`http://troop100.localhost:${E2E_PORT}/admin/members?tab=adults&q=Briar`);
    await expect(page.getByText("Briar Adult")).toBeVisible();
  });
});
