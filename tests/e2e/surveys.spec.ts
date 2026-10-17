// Survey E2E: admin creates a survey, anonymous responder submits,
// admin sees the response.

import { expect, test, type Page } from "@playwright/test";
import { showPasswordSignIn } from "./helpers/flows";

const EMAIL = "scoutmaster@example.invalid";
const PASSWORD = "AdminPasswordTest123!";
const TENANT = "http://troop100.localhost:3000";

async function signInTenant(page: Page) {
  await page.goto(`${TENANT}/login`);
  await showPasswordSignIn(page);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.waitForTimeout(1700);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin/);
}

test.describe("surveys", () => {
  test("admin creates a survey, anonymous responder submits, admin sees the response", async ({
    page,
    browser,
  }) => {
    test.setTimeout(60_000);
    await signInTenant(page);
    await page.goto(`${TENANT}/admin/surveys/new`);
    const ts = Date.now();
    const title = `Survey ${ts}`;
    const slug = `survey-${ts}`;
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("URL slug").fill(slug);
    await page.locator("textarea[name=questions]").fill(
      "text|Your name\nlong|How was the campout?\nyesno|Would you go again?",
    );
    await page.getByRole("button", { name: /create survey/i }).click();
    await page.waitForURL(/\/admin\/surveys$/);
    await expect(page.getByText(title)).toBeVisible();

    // Anonymous fill-out from a fresh context (no cookie session).
    const ctx = await browser.newContext();
    const respondent = await ctx.newPage();
    await respondent.goto(`${TENANT}/survey/${slug}`);
    await respondent.getByLabel("Your name").fill("E2E Respondent");
    await respondent.getByLabel("Email").fill(`e2e-${ts}@example.invalid`);
    // First text field after name/email is the survey's first question.
    const respondentName = `Respondent ${ts}`;
    await respondent.locator('input[name^="q."]').first().fill(respondentName);
    await respondent.locator('textarea[name^="q."]').first().fill("It rained.");
    await respondent.locator('select[name^="q."]').first().selectOption("yes");
    await respondent.getByRole("button", { name: /^submit$/i }).click();
    await respondent.waitForURL(/submitted=1/);
    await ctx.close();

    // Admin sees the response.
    await page.goto(`${TENANT}/admin/surveys`);
    await page.getByRole("link", { name: title }).click();
    await expect(page.getByText("E2E Respondent")).toBeVisible();
  });
});
