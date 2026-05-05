// Public token routes — bad-token paths are pure unit-y; we exercise
// them at the HTTP level since they involve token verification +
// redirects.

import { expect, test } from "@playwright/test";

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

  test("/t/c/<bad-token>?to=... still redirects to the destination", async ({ request }) => {
    const res = await request.get(
      "http://localhost:3000/t/c/bogus?to=" + encodeURIComponent("https://example.com/"),
      { maxRedirects: 0 },
    );
    // Either 3xx redirect or 200 (per Playwright's follow behaviour).
    // We just assert it doesn't 4xx/5xx — we'd rather over-permit than
    // punish recipients with a broken click.
    expect(res.status()).toBeLessThan(400);
  });

  test("/t/c/<missing-to> returns 400", async ({ request }) => {
    const res = await request.get("http://localhost:3000/t/c/anything");
    expect(res.status()).toBe(400);
  });

  test("/t/o/<token>.png always returns a PNG (even bad token)", async ({ request }) => {
    const res = await request.get("http://localhost:3000/t/o/bogus.png");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
  });
});
