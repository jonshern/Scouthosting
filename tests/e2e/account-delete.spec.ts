// Deleting your own account from /account/delete (the page the phone
// apps open). What's removed and what the unit keeps is covered row by
// row in src/lib/account/delete.db.test.ts; this checks the page.

import { expect, test } from "@playwright/test";
import { APEX, USER_PASSWORD, freshPage, signUp, uid } from "./helpers/flows";
import { db } from "./helpers/db";

test.describe("delete account", () => {
  test("asks for the email, then deletes and signs out", async ({ browser }) => {
    const { ctx, page } = await freshPage(browser);
    const email = `delete-${uid()}@example.invalid`;
    await signUp(page, "Leaving Parent", email, USER_PASSWORD, APEX);

    await page.goto(`${APEX}/account/profile`);
    await page.getByRole("link", { name: "Delete my account" }).click();
    await expect(page.getByRole("heading", { name: "Delete account" })).toBeVisible();

    await page.getByLabel(/to confirm/).fill("someone-else@example.invalid");
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page.getByText("That isn't your email address.")).toBeVisible();

    await page.getByLabel(/to confirm/).fill(email);
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page.getByRole("heading", { name: "Your account is deleted" })).toBeVisible();

    const row = await db().user.findFirst({ where: { email }, select: { id: true } });
    expect(row).toBeNull();

    // Signed out: the account pages send you to sign in again.
    await page.goto(`${APEX}/account/profile`);
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });
});
