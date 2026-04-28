import { describe, it, expect } from "vitest";
import { normalisePhone } from "../lib/sms.js";

describe("normalisePhone", () => {
  it("passes E.164 through", () => {
    expect(normalisePhone("+15551234567")).toBe("+15551234567");
    expect(normalisePhone("+447911123456")).toBe("+447911123456");
  });

  it("upgrades 10-digit US to E.164", () => {
    expect(normalisePhone("555-123-4567")).toBe("+15551234567");
    expect(normalisePhone("(555) 123-4567")).toBe("+15551234567");
    expect(normalisePhone("5551234567")).toBe("+15551234567");
  });

  it("upgrades 11-digit US (1 prefix) to E.164", () => {
    expect(normalisePhone("1-555-123-4567")).toBe("+15551234567");
  });

  it("returns null for invalid input", () => {
    expect(normalisePhone("")).toBeNull();
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone("123")).toBeNull();
    expect(normalisePhone("not a number")).toBeNull();
    expect(normalisePhone("+abc12345678")).toBeNull();
  });
});
