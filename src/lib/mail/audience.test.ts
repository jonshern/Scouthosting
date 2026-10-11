import { describe, expect, it } from "vitest";
import { AUDIENCE_LABELS, describeAudience, missingParentIds } from "./audience";

describe("describeAudience", () => {
  it("returns the canonical label for the simple kinds", () => {
    expect(describeAudience({ kind: "everyone" })).toBe(AUDIENCE_LABELS.everyone);
    expect(describeAudience({ kind: "adults" })).toBe(AUDIENCE_LABELS.adults);
    expect(describeAudience({ kind: "youth" })).toBe(AUDIENCE_LABELS.youth);
    expect(describeAudience({ kind: "leaders" })).toBe(AUDIENCE_LABELS.leaders);
  });
  it("includes the patrol name when kind=patrol", () => {
    expect(describeAudience({ kind: "patrol", patrol: "Eagles" })).toBe("Patrol: Eagles");
    expect(describeAudience({ kind: "patrol" })).toBe("Patrol");
  });
});

describe("missingParentIds — parents copied on youth email", () => {
  it("adds the linked parents of every youth recipient", () => {
    const ids = missingParentIds([
      { id: "s1", isYouth: true, parentIds: ["p1", "p2"] },
      { id: "s2", isYouth: true, parentIds: ["p2", "p3"] },
    ]);
    expect(ids.sort()).toEqual(["p1", "p2", "p3"]);
  });
  it("skips parents already on the list", () => {
    expect(
      missingParentIds([
        { id: "s1", isYouth: true, parentIds: ["p1"] },
        { id: "p1", isYouth: false, parentIds: [] },
      ]),
    ).toEqual([]);
  });
  it("ignores parentIds on adult members", () => {
    expect(missingParentIds([{ id: "a1", isYouth: false, parentIds: ["x"] }])).toEqual([]);
  });
});
