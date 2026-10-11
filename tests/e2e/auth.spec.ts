import { expect, test } from "@playwright/test";

const SEEDED_EMAIL = "scoutmaster@example.invalid";
const SEEDED_PASSWORD = "AdminPasswordTest123!";

test.describe("auth flows", () => {
  test("signup form rejects short passwords", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Your name").fill("Pat Tester");
    await page.getByLabel("Email").fill(`new+${Date.now()}@example.invalid`);
    // The browser will block submission via minLength on the input;
    // bypass by removing the attribute so the server-side check fires.
    await page.evaluate(() => {
      const el = document.querySelector<HTMLInputElement>("#password");
      if (el) el.removeAttribute("minlength");
    });
    await page.getByLabel("Password").fill("short");
    await page.getByLabel(/18 or older/).check();
    // wait past the honeypot dwell time
    await page.waitForTimeout(1700);
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("signup creates an account and logs in", async ({ page }) => {
    const email = `newuser+${Date.now()}@example.invalid`;
    await page.goto("/signup");
    await page.getByLabel("Your name").fill("Pat Tester");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("CorrectHorseBatteryStaple!");
    await page.getByLabel(/18 or older/).check();
    await page.waitForTimeout(1700);
    await page.getByRole("button", { name: /create account/i }).click();
    // New account with no org memberships lands on /account/profile per
    // post-login redirect logic.
    await page.waitForURL(/\/account\/profile/);
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === "compass_session")).toBe(true);
  });

  test("signup requires confirming the user is an adult", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Your name").fill("Pat Tester");
    await page.getByLabel("Email").fill(`minor+${Date.now()}@example.invalid`);
    await page.getByLabel("Password").fill("CorrectHorseBatteryStaple!");
    await page.waitForTimeout(1700);
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByRole("alert")).toContainText(/18 or older/);
    await expect(page).toHaveURL(/\/signup/);
  });

  test("login with seeded credentials succeeds", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(SEEDED_EMAIL);
    await page.getByLabel("Password").fill(SEEDED_PASSWORD);
    await page.waitForTimeout(1700);
    await page.getByRole("button", { name: /sign in/i }).click();
    // Seeded scoutmaster is a leader in exactly one org → lands on its admin.
    await page.waitForURL(/\/o\/[^/]+\/admin/);
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === "compass_session")).toBe(true);
  });

  test("login with wrong password is rejected", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(SEEDED_EMAIL);
    await page.getByLabel("Password").fill("not-the-password");
    await page.waitForTimeout(1700);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("CSRF: form posted without csrf cookie is rejected", async ({ request }) => {
    const res = await request.post("/login", {
      multipart: { email: SEEDED_EMAIL, password: SEEDED_PASSWORD },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
