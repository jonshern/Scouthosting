// Channel auto-add rule matcher tests. Pins the contract that
// matchAutoAddRules + buildCurrentTrainingsMap + describeAutoAddRules
// implement on Channel.autoAddRules JSON. Replaces tests/subgroups.test.js
// from before PR-C4 — same logic, new module name.

import { describe, it, expect } from "vitest";
import {
  matchAutoAddRules,
  buildCurrentTrainingsMap,
  describeAutoAddRules,
} from "../lib/channelAutoAdd.js";

const m = (id, attrs = {}) => ({
  id,
  isYouth: false,
  patrol: null,
  skills: [],
  interests: [],
  ...attrs,
});

describe("matchAutoAddRules", () => {
  it("empty rules return every member", () => {
    const members = [m("a"), m("b"), m("c", { isYouth: true })];
    expect(matchAutoAddRules({}, members).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("isYouth filters strictly", () => {
    const members = [m("adult"), m("kid", { isYouth: true })];
    expect(matchAutoAddRules({ isYouth: true }, members).map((x) => x.id)).toEqual(["kid"]);
    expect(matchAutoAddRules({ isYouth: false }, members).map((x) => x.id)).toEqual(["adult"]);
  });

  it("patrols filter is case-insensitive", () => {
    const members = [
      m("w", { patrol: "Wolves" }),
      m("t", { patrol: "Tigers" }),
      m("none", { patrol: null }),
    ];
    expect(matchAutoAddRules({ patrols: ["wolves"] }, members).map((x) => x.id)).toEqual(["w"]);
  });

  it("skills require any-of match (OR within array)", () => {
    const members = [
      m("a", { skills: ["WFA", "Mechanic"] }),
      m("b", { skills: ["Driver"] }),
    ];
    expect(matchAutoAddRules({ skills: ["wfa"] }, members).map((x) => x.id)).toEqual(["a"]);
    expect(matchAutoAddRules({ skills: ["wfa", "driver"] }, members).map((x) => x.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("interests work the same as skills", () => {
    const members = [m("a", { interests: ["camping"] }), m("b", { interests: ["cooking"] })];
    expect(matchAutoAddRules({ interests: ["Camping"] }, members).map((x) => x.id)).toEqual(["a"]);
  });

  it("AND across non-empty filters (patrol AND skill)", () => {
    const members = [
      m("a", { patrol: "Wolves", skills: ["WFA"] }),
      m("b", { patrol: "Wolves", skills: [] }),
      m("c", { patrol: "Tigers", skills: ["WFA"] }),
    ];
    const matched = matchAutoAddRules({ patrols: ["Wolves"], skills: ["WFA"] }, members);
    expect(matched.map((x) => x.id)).toEqual(["a"]);
  });

  it("trainings filter passes through when no training map provided", () => {
    const members = [m("a"), m("b")];
    expect(matchAutoAddRules({ trainings: ["YPT"] }, members).map((x) => x.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("trainings require a current row when training map IS provided", () => {
    const members = [m("a"), m("b")];
    const map = new Map([["a", new Set(["youth protection training"])]]);
    expect(matchAutoAddRules({ trainings: ["Youth Protection Training"] }, members, map).map((x) => x.id)).toEqual(["a"]);
  });

  it("null rules object behaves like empty rules", () => {
    const members = [m("a"), m("b")];
    expect(matchAutoAddRules(null, members).map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("buildCurrentTrainingsMap", () => {
  it("builds a map keyed by memberId with lowercased course names", () => {
    const map = buildCurrentTrainingsMap([
      { memberId: "a", courseName: "Youth Protection Training", expiresAt: null },
      { memberId: "a", courseName: "Hazardous Weather", expiresAt: null },
    ]);
    expect(map.get("a")).toEqual(new Set(["youth protection training", "hazardous weather"]));
  });

  it("drops expired rows", () => {
    const past = new Date(Date.now() - 86400000);
    const future = new Date(Date.now() + 86400000);
    const map = buildCurrentTrainingsMap([
      { memberId: "a", courseName: "Old", expiresAt: past },
      { memberId: "a", courseName: "Fresh", expiresAt: future },
    ]);
    expect(map.get("a")).toEqual(new Set(["fresh"]));
  });

  it("a null expiresAt is permanent", () => {
    const map = buildCurrentTrainingsMap([
      { memberId: "a", courseName: "Lifetime", expiresAt: null },
    ]);
    expect(map.get("a")).toEqual(new Set(["lifetime"]));
  });
});

describe("describeAutoAddRules", () => {
  it("returns 'everyone' when no filters are set", () => {
    expect(describeAutoAddRules({})).toBe("everyone");
    expect(describeAutoAddRules(null)).toBe("everyone");
  });

  it("youth-only", () => {
    expect(describeAutoAddRules({ isYouth: true })).toBe("youth");
  });

  it("adults-only", () => {
    expect(describeAutoAddRules({ isYouth: false })).toBe("adults");
  });

  it("composes with separator", () => {
    expect(
      describeAutoAddRules({
        isYouth: true,
        patrols: ["Wolves", "Tigers"],
        skills: ["WFA"],
      }),
    ).toBe("youth · patrol: Wolves / Tigers · skill: WFA");
  });
});
