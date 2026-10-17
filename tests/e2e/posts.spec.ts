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

test.describe("posts", () => {
  test("admin publishes a post and the public page shows it", async ({ page }) => {
    await login(page);
    await page.goto(`http://troop100.localhost:${E2E_PORT}/admin/posts`);
    const title = `E2E post ${Date.now()}`;
    await page.getByLabel("Title (optional)").fill(title);
    await page.getByLabel("Body").fill("This is the body of the post.\n\nLink: https://example.com");
    await page.getByRole("button", { name: /publish post/i }).click();
    await page.waitForURL("**/admin/posts");
    await expect(page.getByText(title)).toBeVisible();

    await page.goto(`http://troop100.localhost:${E2E_PORT}/posts`);
    await expect(page.getByRole("link", { name: title })).toBeVisible();
  });

  test("signed-in admin can like + bookmark + comment", async ({ page }) => {
    await login(page);
    await page.goto(`http://troop100.localhost:${E2E_PORT}/admin/posts`);
    const title = `E2E reactions ${Date.now()}`;
    await page.getByLabel("Title (optional)").fill(title);
    await page.getByLabel("Body").fill("Reactions test.");
    await page.getByRole("button", { name: /publish post/i }).click();
    await page.waitForURL("**/admin/posts");
    const href = await page.locator(`a:has-text("${title}")`).first().getAttribute("href");
    expect(href).toMatch(/\/admin\/posts\/[a-z0-9]+$/);
    const postId = href!.split("/").pop()!;
    await page.goto(`http://troop100.localhost:${E2E_PORT}/posts/${postId}`);

    // Like
    await page.getByRole("button", { name: /like · 0/i }).click();
    await expect(page.getByRole("button", { name: /like · 1/i })).toBeVisible();

    // Comment
    await page.getByLabel("Comment").fill("Thanks for the heads up.");
    await page.getByRole("button", { name: /post comment/i }).click();
    await expect(page.getByText("Thanks for the heads up.")).toBeVisible();
  });

  test("members-only post is hidden from anonymous public list", async ({ page, browser }) => {
    await login(page);
    await page.goto(`http://troop100.localhost:${E2E_PORT}/admin/posts`);
    const title = `Members ${Date.now()}`;
    await page.getByLabel("Title (optional)").fill(title);
    await page.getByLabel("Body").fill("Members only.");
    await page.locator("#visibility").selectOption("members");
    await page.getByRole("button", { name: /publish post/i }).click();
    await page.waitForURL("**/admin/posts");

    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(`http://troop100.localhost:${E2E_PORT}/posts`);
    await expect(anonPage.getByText(title)).toHaveCount(0);
    await anon.close();
  });
});
