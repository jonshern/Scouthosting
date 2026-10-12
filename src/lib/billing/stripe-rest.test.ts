import { describe, expect, it, vi } from "vitest";
import { StripeApiError, createStripeRestClient, encodeStripeForm } from "./stripe-rest";

describe("encodeStripeForm", () => {
  it("brackets nested objects and arrays the way Stripe expects", () => {
    const body = encodeStripeForm({
      mode: "subscription",
      line_items: [{ price: "price_1", quantity: 1 }],
      subscription_data: { metadata: { orgId: "o1" }, trial_end: 1700000000 },
      allow_promotion_codes: false,
      customer: undefined,
      skipped: null,
    });
    expect(decodeURIComponent(body).split("&")).toEqual([
      "mode=subscription",
      "line_items[0][price]=price_1",
      "line_items[0][quantity]=1",
      "subscription_data[metadata][orgId]=o1",
      "subscription_data[trial_end]=1700000000",
      "allow_promotion_codes=false",
    ]);
  });
});

describe("createStripeRestClient", () => {
  it("posts form-encoded with the secret key and API version", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "cs_1", url: "https://checkout" }), { status: 200 }));
    const client = createStripeRestClient("sk_test_x", fetchImpl);
    const res = await client.checkout.sessions.create({ mode: "subscription" });
    expect(res).toEqual({ id: "cs_1", url: "https://checkout" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk_test_x");
    expect(headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(headers["stripe-version"]).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(init.body).toBe("mode=subscription");
  });

  it("raises Stripe's error message and code", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: "resource_missing", message: "No such price" } }), { status: 400 }),
    );
    const client = createStripeRestClient("sk_test_x", fetchImpl);
    const err = await client.subscriptions.update("sub_1", {}).catch((e) => e);
    expect(err).toBeInstanceOf(StripeApiError);
    expect(err).toMatchObject({ status: 400, code: "resource_missing", message: "No such price" });
  });
});
