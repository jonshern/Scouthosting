import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signState, verifyState } from "./oauth";

describe("OAuth state cookie sign/verify", () => {
  const originalSecret = process.env["SESSION_SECRET"];

  beforeEach(() => {
    process.env["SESSION_SECRET"] = "test-secret-not-for-production";
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env["SESSION_SECRET"];
    else process.env["SESSION_SECRET"] = originalSecret;
  });

  it("round-trips an unmodified state value", () => {
    const state = "abc123-state-token";
    const signed = signState(state);
    expect(signed).toContain(".");
    expect(verifyState(signed)).toBe(state);
  });

  it("round-trips a long random state", () => {
    const state = "a".repeat(64) + "_xyz";
    expect(verifyState(signState(state))).toBe(state);
  });

  it("rejects null / empty input", () => {
    expect(verifyState(null)).toBeNull();
    expect(verifyState(undefined)).toBeNull();
    expect(verifyState("")).toBeNull();
  });

  it("rejects values without a signature", () => {
    expect(verifyState("just-the-state")).toBeNull();
  });

  it("rejects a value with a tampered state", () => {
    const signed = signState("original-state");
    const idx = signed.lastIndexOf(".");
    const tampered = "tampered" + signed.slice(idx);
    expect(verifyState(tampered)).toBeNull();
  });

  it("rejects a value with a tampered signature", () => {
    const signed = signState("clean-state");
    const idx = signed.lastIndexOf(".");
    const tampered = signed.slice(0, idx + 1) + "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect(verifyState(tampered)).toBeNull();
  });

  it("rejects a value signed with a different secret", () => {
    const signed = signState("state-x");
    process.env["SESSION_SECRET"] = "different-secret";
    expect(verifyState(signed)).toBeNull();
  });
});
