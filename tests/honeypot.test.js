import { describe, it, expect, beforeAll } from "vitest";
import { honeypotFields, verifyHoneypot, _internal } from "../lib/honeypot.js";

beforeAll(() => {
  process.env.HONEYPOT_SECRET = "test-honeypot-secret";
});

describe("honeypot", () => {
  it("renders a hidden trap field + signed timestamp", () => {
    const html = honeypotFields();
    expect(html).toContain(`name="${_internal.HONEYPOT_FIELD}"`);
    expect(html).toContain(`name="${_internal.TIME_FIELD}"`);
    expect(html).toContain("position:absolute");
  });

  it("accepts a real-looking submission once minimum time passes", () => {
    const past = Date.now() - 5000;
    const ts = _internal.sign(past);
    const out = verifyHoneypot({
      [_internal.TIME_FIELD]: ts,
      [_internal.HONEYPOT_FIELD]: "",
    });
    expect(out.ok).toBe(true);
  });

  it("rejects when the honeypot field is filled", () => {
    const past = Date.now() - 5000;
    const ts = _internal.sign(past);
    const out = verifyHoneypot({
      [_internal.TIME_FIELD]: ts,
      [_internal.HONEYPOT_FIELD]: "https://spam.example/",
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("honeypot-tripped");
  });

  it("rejects too-fast submissions", () => {
    const ts = _internal.sign(Date.now());
    const out = verifyHoneypot({
      [_internal.TIME_FIELD]: ts,
      [_internal.HONEYPOT_FIELD]: "",
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("bad-timing");
  });

  it("rejects tampered or missing timestamps", () => {
    expect(verifyHoneypot({ [_internal.TIME_FIELD]: "", [_internal.HONEYPOT_FIELD]: "" }).ok).toBe(false);
    expect(verifyHoneypot({ [_internal.TIME_FIELD]: "garbage", [_internal.HONEYPOT_FIELD]: "" }).ok).toBe(false);
    expect(verifyHoneypot({ [_internal.TIME_FIELD]: "12345.bad", [_internal.HONEYPOT_FIELD]: "" }).ok).toBe(false);
  });
});
