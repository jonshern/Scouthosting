import { describe, expect, it } from "vitest";
import {
  buildCurrentTrainingsMap,
  describeAutoAddRules,
  matchAutoAddRules,
  type MatchableMember,
} from "./auto-add";

const M = (over: Partial<MatchableMember> = {}): MatchableMember => ({
  id: over.id ?? "m_x",
  isYouth: over.isYouth,
  patrol: over.patrol,
  skills: over.skills ?? [],
  interests: over.interests ?? [],
  parentIds: over.parentIds ?? [],
});

describe("chat/auto-add/matchAutoAddRules", () => {
  it("empty rules match everyone", () => {
    const ms = [M({ id: "1" }), M({ id: "2" })];
    expect(matchAutoAddRules({}, ms).map((m) => m.id)).toEqual(["1", "2"]);
  });

  it("filters by isYouth", () => {
    const ms = [M({ id: "1", isYouth: true }), M({ id: "2", isYouth: false })];
    expect(matchAutoAddRules({ isYouth: true }, ms).map((m) => m.id)).toEqual(["1"]);
  });

  it("filters by patrol (case-insensitive)", () => {
    const ms = [M({ id: "1", patrol: "Eagles" }), M({ id: "2", patrol: "Foxes" })];
    expect(matchAutoAddRules({ patrols: ["eagles"] }, ms).map((m) => m.id)).toEqual(["1"]);
  });

  it("OR within skills (member has any of the listed skills)", () => {
    const ms = [
      M({ id: "1", skills: ["climb"] }),
      M({ id: "2", skills: ["swim"] }),
      M({ id: "3", skills: ["bike"] }),
    ];
    expect(matchAutoAddRules({ skills: ["climb", "swim"] }, ms).map((m) => m.id)).toEqual([
      "1",
      "2",
    ]);
  });

  it("parents-of-youth resolves via parentIds and dedupes", () => {
    const ms = [
      M({ id: "p1" }),
      M({ id: "p2" }),
      M({ id: "y1", isYouth: true, patrol: "Lion", parentIds: ["p1", "p2"] }),
      M({ id: "y2", isYouth: true, patrol: "Lion", parentIds: ["p1"] }), // sibling
    ];
    const out = matchAutoAddRules(
      { audience: "parents-of-youth", patrols: ["Lion"] },
      ms,
    );
    expect(out.map((m) => m.id).sort()).toEqual(["p1", "p2"]);
  });

  it("skips trainings filter when no map provided", () => {
    const ms = [M({ id: "1" })];
    expect(matchAutoAddRules({ trainings: ["ypt"] }, ms).map((m) => m.id)).toEqual(["1"]);
  });

  it("uses trainings map when provided", () => {
    const ms = [M({ id: "1" }), M({ id: "2" })];
    const map = new Map([["1", new Set(["ypt"])]]);
    expect(matchAutoAddRules({ trainings: ["ypt"] }, ms, map).map((m) => m.id)).toEqual(["1"]);
  });
});

describe("chat/auto-add/buildCurrentTrainingsMap", () => {
  it("drops expired courses", () => {
    const trainings = [
      { memberId: "m1", courseName: "YPT", expiresAt: new Date("2020-01-01") },
      { memberId: "m1", courseName: "Wilderness", expiresAt: null },
    ];
    const map = buildCurrentTrainingsMap(trainings);
    const set = map.get("m1");
    expect(set?.has("ypt")).toBe(false);
    expect(set?.has("wilderness")).toBe(true);
  });
});

describe("chat/auto-add/describeAutoAddRules", () => {
  it("renders parents-of-(...) wrapper", () => {
    expect(describeAutoAddRules({ audience: "parents-of-youth", isYouth: true, patrols: ["Lion"] })).toBe(
      "parents of (youth · patrol: Lion)",
    );
  });

  it("renders 'everyone' for empty rules", () => {
    expect(describeAutoAddRules({})).toBe("everyone");
  });
});
