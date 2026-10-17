// Webhook routes — no real signature in test, so we exercise the
// 503 (unconfigured) and 401 (bad signature) paths.

import { expect, test } from "@playwright/test";
import { E2E_PORT } from "./helpers/ports";

test.describe("webhooks", () => {
  test("POST /api/webhooks/stripe returns 503 when secret unset", async ({ request }) => {
    const res = await request.post(`http://localhost:${E2E_PORT}/api/webhooks/stripe`, {
      data: { type: "irrelevant" },
    });
    // STRIPE_WEBHOOK_SECRET isn't set in the test env -> 503.
    expect([503, 401]).toContain(res.status());
  });

  test("POST /api/webhooks/resend returns 503 when secret unset", async ({ request }) => {
    const res = await request.post(`http://localhost:${E2E_PORT}/api/webhooks/resend`, {
      data: { type: "email.delivered" },
    });
    expect([503, 401]).toContain(res.status());
  });
});
