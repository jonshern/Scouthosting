import { describe, expect, it } from "vitest";
import { FEATURE_FLAGS, isEnabled, mergeUpdate, resolveAll } from "./index";

describe("features/index", () => {
  it("returns default when flag not set on org", () => {
    expect(isEnabled({ features: null }, "chat.enabled")).toBe(true);
    expect(isEnabled({ features: {} }, "mobile.pushNotifications")).toBe(false);
  });

  it("respects org override", () => {
    expect(isEnabled({ features: { "chat.enabled": false } }, "chat.enabled")).toBe(false);
    expect(
      isEnabled({ features: { "mobile.pushNotifications": true } }, "mobile.pushNotifications"),
    ).toBe(true);
  });

  it("throws for unknown flag", () => {
    expect(() => isEnabled({ features: {} }, "bogus.flag" as never)).toThrow(/Unknown feature flag/);
  });

  it("resolveAll returns every key", () => {
    const all = resolveAll({ features: { "chat.enabled": false } });
    expect(all["chat.enabled"]).toBe(false);
    expect(Object.keys(all).length).toBe(Object.keys(FEATURE_FLAGS).length);
  });

  it("mergeUpdate rejects unknown keys", () => {
    expect(() => mergeUpdate({}, { "unknown.flag": true })).toThrow(/Unknown feature flag/);
  });

  it("mergeUpdate coerces to boolean", () => {
    const out = mergeUpdate({}, { "chat.enabled": "yes" });
    expect(out["chat.enabled"]).toBe(true);
  });
});
