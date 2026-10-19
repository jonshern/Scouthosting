// Public token routes — bad-token paths are pure unit-y; we exercise
// them at the HTTP level since they involve token verification +
// redirects.

import { expect, test } from "@playwright/test";
import { E2E_PORT } from "./helpers/ports";

test.describe("public token routes", () => {
  test("/rsvp/<bad-token> renders the expired state", async ({ page }) => {
    await page.goto("/rsvp/this-is-not-a-real-token");
    await expect(
      page.getByRole("heading", { name: /link expired/i }),
    ).toBeVisible();
  });

  test("/unsubscribe/<bad-token> renders the expired state", async ({ page }) => {
    await page.goto("/unsubscribe/this-is-not-a-real-token");
    await expect(
      page.getByRole("heading", { name: /link expired/i }),
    ).toBeVisible();
  });

  // Email open and click tracking was never wired up and is gone, so
  // these paths must not redirect anywhere.
  test("/t/c and /t/o no longer exist", async ({ request }) => {
    const click = await request.get(
      `http://localhost:${E2E_PORT}/t/c/bogus?to=` + encodeURIComponent("https://example.com/"),
      { maxRedirects: 0 },
    );
    expect(click.status()).toBe(404);
    const open = await request.get(`http://localhost:${E2E_PORT}/t/o/bogus.png`);
    expect(open.status()).toBe(404);
  });
});
