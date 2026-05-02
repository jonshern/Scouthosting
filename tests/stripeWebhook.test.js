// Tests for lib/stripe.js — signature verification + the status mapper.
// We don't exercise syncFromStripeEvent here because it touches Prisma;
// integration coverage will live in tests/integration/billing.test.js
// once the migration runs in CI.

import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyStripeSignature, _internal } from "../lib/stripe.js";

const SECRET = "whsec_test_compass_billing";

function stripeSig({ ts, body }, secret = SECRET) {
  const signed = `${ts}.${body}`;
  const v1 = crypto.createHmac("sha256", secret).update(signed).digest("hex");
  return `t=${ts},v1=${v1}`;
}

describe("verifyStripeSignature", () => {
  it("accepts a well-signed payload", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ id: "evt_1", type: "ping" });
    const v = verifyStripeSignature(body, stripeSig({ ts, body }), SECRET);
    expect(v.ok).toBe(true);
  });

  it("rejects when the body is mutated", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ id: "evt_1", type: "ping" });
    const sig = stripeSig({ ts, body });
    const v = verifyStripeSignature(body + "TAMPERED", sig, SECRET);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("no_match");
  });

  it("rejects on stale timestamps", () => {
    const ts = String(Math.floor(Date.now() / 1000) - 10 * 60); // 10 min ago
    const body = "{}";
    const v = verifyStripeSignature(body, stripeSig({ ts, body }), SECRET);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("timestamp_skew");
  });

  it("rejects when the header is malformed", () => {
    expect(verifyStripeSignature("{}", "not-a-real-header", SECRET).ok).toBe(false);
    expect(verifyStripeSignature("{}", "", SECRET).ok).toBe(false);
  });

  it("rejects when secret is missing", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const v = verifyStripeSignature("{}", stripeSig({ ts, body: "{}" }), "");
    expect(v.ok).toBe(false);
  });

  it("supports multiple v1 signatures (during key rotation)", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = "{}";
    const realSig = stripeSig({ ts, body });
    // Splice in a second, wrong v1 signature alongside the real one.
    const realV1 = realSig.split(",").find((s) => s.startsWith("v1="));
    const fakeV1 = "v1=" + "0".repeat(64);
    const header = `t=${ts},${fakeV1},${realV1}`;
    expect(verifyStripeSignature(body, header, SECRET).ok).toBe(true);
  });
});

describe("mapStripeStatus", () => {
  const map = _internal.mapStripeStatus;
  it("maps Stripe statuses to our 5 buckets", () => {
    expect(map("active")).toBe("active");
    expect(map("trialing")).toBe("active"); // stripe-side trial = card on file
    expect(map("past_due")).toBe("past_due");
    expect(map("unpaid")).toBe("past_due");
    expect(map("canceled")).toBe("canceled");
    expect(map("incomplete_expired")).toBe("canceled");
    expect(map("incomplete")).toBe("past_due");
    expect(map("paused")).toBe("past_due");
    expect(map("anything_else")).toBe("past_due"); // fail closed
  });
});
