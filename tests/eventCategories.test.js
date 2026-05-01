// Event-category resolution tests. The category string is free-form
// in the schema; this module turns it into typed metadata for the UI.

import { describe, it, expect } from "vitest";
import {
  CATEGORIES,
  CATEGORY_KEYS,
  normaliseCategory,
  categoryMeta,
  categoryColor,
} from "../lib/eventCategories.js";

describe("normaliseCategory", () => {
  it("maps standard keys", () => {
    expect(normaliseCategory("meeting")).toBe("meeting");
    expect(normaliseCategory("campout")).toBe("campout");
  });

  it("normalises whitespace + casing + underscores", () => {
    expect(normaliseCategory("Court of Honor")).toBe("court-of-honor");
    expect(normaliseCategory("court_of_honor")).toBe("court-of-honor");
    expect(normaliseCategory("  HIGHADVENTURE ")).toBe("highadventure");
  });

  it("returns null for empty / unknown values", () => {
    expect(normaliseCategory(null)).toBeNull();
    expect(normaliseCategory("")).toBeNull();
    expect(normaliseCategory("pancake-breakfast")).toBeNull();
  });
});

describe("categoryMeta", () => {
  it("returns label + color for known categories", () => {
    expect(categoryMeta("campout")).toEqual({ label: "Campout", color: "accent" });
    expect(categoryMeta("blueandgold")).toEqual({ label: "Blue & Gold", color: "ember" });
  });

  it("passes through unknown free-form labels with a primary color", () => {
    const m = categoryMeta("Pancake Breakfast");
    expect(m.label).toBe("Pancake Breakfast");
    expect(m.color).toBe("primary");
  });

  it("falls back to 'Event' when missing", () => {
    expect(categoryMeta(null)).toEqual({ label: "Event", color: "primary" });
    expect(categoryMeta("")).toEqual({ label: "Event", color: "primary" });
  });
});

describe("categoryColor convenience", () => {
  it("matches categoryMeta(...).color", () => {
    expect(categoryColor("meeting")).toBe("sky");
    expect(categoryColor("court-of-honor")).toBe("raspberry");
    expect(categoryColor(null)).toBe("primary");
  });
});

describe("registry shape", () => {
  it("every category has a label + color", () => {
    for (const k of CATEGORY_KEYS) {
      expect(CATEGORIES[k]).toHaveProperty("label");
      expect(CATEGORIES[k]).toHaveProperty("color");
    }
  });

  it("is frozen so consumers can't mutate the registry at runtime", () => {
    expect(Object.isFrozen(CATEGORIES)).toBe(true);
    expect(Object.isFrozen(CATEGORY_KEYS)).toBe(true);
  });
});
