import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  CATEGORY_KEYS,
  categoryColor,
  categoryMeta,
  normaliseCategory,
  resolveCategoryStyle,
  slugifyCategory,
} from "./categories";

describe("calendar/categories", () => {
  it("normaliseCategory accepts variants", () => {
    expect(normaliseCategory("Court of Honor")).toBe("court-of-honor");
    expect(normaliseCategory("court_of_honor")).toBe("court-of-honor");
    expect(normaliseCategory("MEETING")).toBe("meeting");
    expect(normaliseCategory("unknown")).toBeNull();
    expect(normaliseCategory("")).toBeNull();
    expect(normaliseCategory(null)).toBeNull();
  });

  it("slugifyCategory strips garbage characters", () => {
    expect(slugifyCategory("My Custom!! Cat")).toBe("my-custom-cat");
    expect(slugifyCategory("")).toBeNull();
  });

  it("categoryMeta returns hardcoded color for known keys", () => {
    expect(categoryMeta("meeting").color).toBe("sky");
    expect(categoryColor("campout")).toBe("accent");
  });

  it("categoryMeta falls through to primary for free-form labels", () => {
    expect(categoryMeta("Some Custom").color).toBe("primary");
    expect(categoryMeta(null).label).toBe("Event");
  });

  it("CATEGORY_KEYS lists all categories", () => {
    expect(CATEGORY_KEYS.length).toBe(Object.keys(CATEGORIES).length);
  });

  it("resolveCategoryStyle uses customMap when present and contrast picks fg", () => {
    const map = { meeting: { label: "Pack Meeting", color: "#000000" } };
    const style = resolveCategoryStyle("meeting", map);
    expect(style.label).toBe("Pack Meeting");
    expect(style.bg).toBe("#000000");
    expect(style.fg).toBe("#fff");
  });

  it("resolveCategoryStyle falls back to var(--color) without customMap", () => {
    const style = resolveCategoryStyle("meeting");
    expect(style.bg).toBe("var(--sky)");
  });
});
