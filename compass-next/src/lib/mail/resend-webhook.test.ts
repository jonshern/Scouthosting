import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeResendEvent, verifyResendSignature } from "./resend-webhook";

function makeSecret(): string {
  const raw = crypto.randomBytes(24);
  return `whsec_${raw.toString("base64")}`;
}

function sign(secret: string, id: string, ts: string, body: string): string {
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const key = Buffer.from(raw, "base64");
  const sig = crypto
    .createHmac("sha256", key)
    .update(`${id}.${ts}.${body}`)
    .digest("base64");
  return `v1,${sig}`;
}

describe("resend-webhook/verify", () => {
  it("verifies a freshly-signed payload", () => {
    const secret = makeSecret();
    const id = "msg_1";
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: "email.delivered", data: { to: "x@y.com" } });
    const headers = {
      "svix-id": id,
      "svix-timestamp": ts,
      "svix-signature": sign(secret, id, ts, body),
    };
    expect(verifyResendSignature(headers, body, secret).ok).toBe(true);
  });

  it("fails missing headers", () => {
    expect(verifyResendSignature({}, "{}", "whsec_AAAA").ok).toBe(false);
  });

  it("fails on timestamp skew", () => {
    const secret = makeSecret();
    const id = "msg_1";
    const ts = String(Math.floor(Date.now() / 1000) - 60 * 60); // 1h ago
    const body = "{}";
    const headers = {
      "svix-id": id,
      "svix-timestamp": ts,
      "svix-signature": sign(secret, id, ts, body),
    };
    const v = verifyResendSignature(headers, body, secret);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("timestamp_skew");
  });

  it("fails on bad signature", () => {
    const secret = makeSecret();
    const id = "msg_1";
    const ts = String(Math.floor(Date.now() / 1000));
    const headers = {
      "svix-id": id,
      "svix-timestamp": ts,
      "svix-signature": "v1,thisisnotreal",
    };
    expect(verifyResendSignature(headers, "{}", secret).ok).toBe(false);
  });

  it("accepts signature when one of multiple v1 tokens matches (rotation)", () => {
    const secret = makeSecret();
    const id = "msg_1";
    const ts = String(Math.floor(Date.now() / 1000));
    const body = "{}";
    const ok = sign(secret, id, ts, body);
    const headers = {
      "svix-id": id,
      "svix-timestamp": ts,
      "svix-signature": `v1,oldsigthatfails ${ok}`,
    };
    expect(verifyResendSignature(headers, body, secret).ok).toBe(true);
  });
});

describe("resend-webhook/normalize", () => {
  it("classifies bounced events with bounceType", () => {
    const ev = normalizeResendEvent({
      type: "email.bounced",
      data: { to: ["X@Y.com"], bounce: { bounceType: "Permanent" } },
    });
    expect(ev.kind).toBe("bounced");
    expect(ev.email).toBe("x@y.com");
    expect(ev.reason).toBe("bounced:permanent");
  });

  it("classifies complained events", () => {
    const ev = normalizeResendEvent({ type: "email.complained", data: { to: "z@w.com" } });
    expect(ev.kind).toBe("complained");
    expect(ev.reason).toBe("complained");
  });

  it("ignores delivered / opened / clicked", () => {
    expect(normalizeResendEvent({ type: "email.delivered", data: { to: "x@y.com" } }).kind).toBeNull();
    expect(normalizeResendEvent({ type: "email.opened", data: { to: "x@y.com" } }).kind).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(normalizeResendEvent(null).kind).toBeNull();
    expect(normalizeResendEvent(undefined).kind).toBeNull();
  });
});
