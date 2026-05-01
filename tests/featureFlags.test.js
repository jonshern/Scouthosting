// Feature-flag tests. The contract: known keys resolve to either the
// org override or the registered default; unknown keys throw loud so a
// typo in a feature gate fails CI instead of silently returning undefined.

import { describe, it, expect } from "vitest";
import {
  FEATURE_FLAGS,
  isEnabled,
  resolveAll,
  mergeUpdate,
} from "../lib/featureFlags.js";

describe("FEATURE_FLAGS registry", () => {
  it("every flag has a default + description", () => {
    for (const [k, v] of Object.entries(FEATURE_FLAGS)) {
      expect(v).toHaveProperty("default");
      expect(typeof v.description).toBe("string");
      expect(v.description.length).toBeGreaterThan(0);
    }
  });

  it("is frozen so callers can't mutate the registry at runtime", () => {
    expect(Object.isFrozen(FEATURE_FLAGS)).toBe(true);
  });
});

describe("isEnabled", () => {
  it("returns the default when the org has no override", () => {
    expect(isEnabled({ features: null }, "chat.enabled")).toBe(true);
    expect(isEnabled({ features: {} }, "mobile.pushNotifications")).toBe(false);
  });

  it("respects org overrides", () => {
    const org = { features: { "chat.enabled": false, "mobile.pushNotifications": true } };
    expect(isEnabled(org, "chat.enabled")).toBe(false);
    expect(isEnabled(org, "mobile.pushNotifications")).toBe(true);
  });

  it("treats null override as unset (falls back to default)", () => {
    const org = { features: { "chat.enabled": null } };
    expect(isEnabled(org, "chat.enabled")).toBe(true);
  });

  it("throws on unknown flag (typos fail loud)", () => {
    expect(() => isEnabled({}, "chat.totallyMadeUp")).toThrow(/Unknown feature flag/);
  });
});

describe("resolveAll", () => {
  it("returns every registered flag with its resolved value", () => {
    const flags = resolveAll({ features: { "chat.enabled": false } });
    for (const k of Object.keys(FEATURE_FLAGS)) {
      expect(flags).toHaveProperty(k);
    }
    expect(flags["chat.enabled"]).toBe(false);
    expect(flags["newsletter.enabled"]).toBe(true);
  });
});

describe("mergeUpdate", () => {
  it("merges a partial patch onto the existing features", () => {
    const merged = mergeUpdate(
      { "chat.enabled": false },
      { "newsletter.enabled": false },
    );
    expect(merged).toEqual({
      "chat.enabled": false,
      "newsletter.enabled": false,
    });
  });

  it("coerces patch values to booleans (form posts arrive as strings)", () => {
    const merged = mergeUpdate({}, { "chat.enabled": "true" });
    expect(merged["chat.enabled"]).toBe(true);
  });

  it("throws on unknown keys (admin form tampering)", () => {
    expect(() => mergeUpdate({}, { "evil.flag": true })).toThrow(/Unknown feature flag/);
  });

  it("starts from an empty object when current is null/undefined", () => {
    const merged = mergeUpdate(null, { "chat.enabled": false });
    expect(merged).toEqual({ "chat.enabled": false });
  });
});
