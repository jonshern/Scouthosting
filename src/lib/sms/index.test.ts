import { describe, expect, it } from "vitest";
import { normalisePhone, sendSms } from "./index";

describe("sms/normalisePhone", () => {
  it("passes through E.164", () => {
    expect(normalisePhone("+15551234567")).toBe("+15551234567");
  });

  it("converts 10-digit US to +1...", () => {
    expect(normalisePhone("555-123-4567")).toBe("+15551234567");
    expect(normalisePhone("(555) 123-4567")).toBe("+15551234567");
  });

  it("converts 11-digit leading 1", () => {
    expect(normalisePhone("15551234567")).toBe("+15551234567");
  });

  it("returns null for garbage", () => {
    expect(normalisePhone("123")).toBeNull();
    expect(normalisePhone("")).toBeNull();
    expect(normalisePhone(null)).toBeNull();
  });
});

describe("sms/sendSms", () => {
  it("rejects missing recipient or body", async () => {
    expect((await sendSms({ to: "", body: "hi" })).ok).toBe(false);
    expect((await sendSms({ to: "+15551234567", body: "" })).ok).toBe(false);
  });

  it("rejects unparseable phone", async () => {
    const r = await sendSms({ to: "totally not a phone", body: "hi" });
    expect(r.ok).toBe(false);
  });

  it("console driver returns ok with an id", async () => {
    const r = await sendSms({ to: "+15551234567", body: "hello" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.id).toMatch(/^sms-console-/);
  });
});
