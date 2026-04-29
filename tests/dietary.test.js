import { describe, it, expect } from "vitest";
import {
  MEAL_DIETARY_TAGS,
  sanitizeMealTags,
  mealConflicts,
} from "../lib/dietary.js";

describe("sanitizeMealTags", () => {
  it("keeps known tags, lowercases, dedupes", () => {
    const out = sanitizeMealTags(["contains-meat", "Contains-Meat", "contains-gluten"]);
    expect(out).toEqual(["contains-meat", "contains-gluten"]);
  });

  it("drops unknown tags and non-strings", () => {
    const out = sanitizeMealTags(["contains-meat", "free-form", null, 7]);
    expect(out).toEqual(["contains-meat"]);
  });

  it("handles single-string and null inputs", () => {
    expect(sanitizeMealTags("contains-egg")).toEqual(["contains-egg"]);
    expect(sanitizeMealTags(null)).toEqual([]);
  });

  it("exposes a non-empty preset list", () => {
    expect(MEAL_DIETARY_TAGS.length).toBeGreaterThan(5);
  });
});

describe("mealConflicts", () => {
  const members = [
    { firstName: "Alex", lastName: "Park", dietaryFlags: ["Vegetarian"] },
    { firstName: "Sam", lastName: "Lee", dietaryFlags: ["gluten-free", "Nut allergy"] },
    { firstName: "Jess", lastName: "Doe", dietaryFlags: [] },
  ];

  it("flags a vegetarian against a meat meal", () => {
    const c = mealConflicts(members, ["contains-meat"]);
    expect(c).toHaveLength(1);
    expect(c[0].name).toBe("Alex Park");
    expect(c[0].flag).toBe("Vegetarian");
    expect(c[0].tags).toEqual(["contains-meat"]);
  });

  it("returns nothing when the meal has no tags", () => {
    expect(mealConflicts(members, [])).toEqual([]);
  });

  it("matches multiple flags per member separately", () => {
    const c = mealConflicts(members, ["contains-gluten", "contains-nut"]);
    expect(c).toHaveLength(2);
    const flags = c.map((x) => x.flag).sort();
    expect(flags).toEqual(["Nut allergy", "gluten-free"]);
  });

  it("ignores free-form flags that don't map to a known conflict", () => {
    const ms = [{ firstName: "X", lastName: "Y", dietaryFlags: ["picky eater"] }];
    expect(mealConflicts(ms, ["contains-meat"])).toEqual([]);
  });

  it("vegan triggers on dairy + egg, not just meat", () => {
    const ms = [{ firstName: "V", lastName: "G", dietaryFlags: ["vegan"] }];
    const c = mealConflicts(ms, ["contains-dairy", "contains-egg"]);
    expect(c).toHaveLength(1);
    expect(c[0].tags.sort()).toEqual(["contains-dairy", "contains-egg"]);
  });
});
