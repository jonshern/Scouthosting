import { describe, expect, it } from "vitest";
import { mealConflicts, sanitizeMealTags } from "./dietary";

describe("trips/dietary/sanitizeMealTags", () => {
  it("filters unknown tags and dedupes", () => {
    expect(
      sanitizeMealTags(["Contains-Meat", "contains-meat", "garbage", "contains-fish"]),
    ).toEqual(["contains-meat", "contains-fish"]);
  });

  it("normalises non-array input", () => {
    expect(sanitizeMealTags("contains-meat")).toEqual(["contains-meat"]);
    expect(sanitizeMealTags(null)).toEqual([]);
  });
});

describe("trips/dietary/mealConflicts", () => {
  const veg = { firstName: "Avery", lastName: "V", dietaryFlags: ["Vegetarian"] };
  const peanut = {
    firstName: "Briar",
    lastName: "P",
    dietaryFlags: ["nut allergy"],
  };
  const empty = { firstName: "Casey", lastName: "C", dietaryFlags: [] };

  it("flags vegetarian on a meal containing meat", () => {
    const out = mealConflicts([veg], ["contains-meat"]);
    expect(out).toEqual([{ name: "Avery V", flag: "Vegetarian", tags: ["contains-meat"] }]);
  });

  it("flags nut allergy on contains-peanut", () => {
    const out = mealConflicts([peanut], ["contains-peanut"]);
    expect(out[0].tags).toEqual(["contains-peanut"]);
  });

  it("returns [] when no tags overlap", () => {
    expect(mealConflicts([veg], ["contains-dairy"])).toEqual([]);
  });

  it("members with no flags are skipped", () => {
    expect(mealConflicts([empty], ["contains-meat"])).toEqual([]);
  });
});
