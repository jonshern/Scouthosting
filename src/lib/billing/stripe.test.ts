import { afterEach, describe, expect, it, vi } from "vitest";
import { _internal, isConfigured } from "./stripe";

describe("isConfigured", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("needs a real secret key and price, not Terraform's placeholders", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc");
    vi.stubEnv("STRIPE_PRICE_ID", "price_123");
    expect(isConfigured()).toBe(true);
    vi.stubEnv("STRIPE_SECRET_KEY", "unset-0f3a9c");
    expect(isConfigured()).toBe(false);
    vi.stubEnv("STRIPE_SECRET_KEY", "rk_live_abc");
    vi.stubEnv("STRIPE_PRICE_ID", "");
    expect(isConfigured()).toBe(false);
  });
});

describe("webhook helpers", () => {
  it("reads the period end from the subscription or, on newer API versions, its item", () => {
    expect(_internal.periodEnd({ current_period_end: 1_800_000_000 })?.getTime()).toBe(1_800_000_000_000);
    expect(
      _internal.periodEnd({ items: { data: [{ current_period_end: 1_900_000_000 }] } })?.getTime(),
    ).toBe(1_900_000_000_000);
    expect(_internal.periodEnd({})).toBeNull();
  });

  it("counts a Stripe trial with a card on file as active", () => {
    expect(_internal.mapStripeStatus("trialing")).toBe("active");
    expect(_internal.mapStripeStatus("unpaid")).toBe("past_due");
    expect(_internal.mapStripeStatus("incomplete_expired")).toBe("canceled");
  });
});
