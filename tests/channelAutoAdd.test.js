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

describe('matchAutoAddRules — audience: "parents-of-youth"', () => {
  // Cub Scout shape: youth Members have no email; their parents (also
  // Members in the directory) carry the contact info and are linked
  // back via youth.parentIds.
  function packMembers() {
    return [
      // Lion cubs (no contact info)
      m("lion-1", { isYouth: true, patrol: "Lion", parentIds: ["mom-1", "dad-1"] }),
      m("lion-2", { isYouth: true, patrol: "Lion", parentIds: ["mom-2"] }),
      // Tiger cub
      m("tiger-1", { isYouth: true, patrol: "Tiger", parentIds: ["dad-3"] }),
      // Adult parents
      m("mom-1", { isYouth: false }),
      m("dad-1", { isYouth: false }),
      m("mom-2", { isYouth: false }),
      m("dad-3", { isYouth: false }),
      // Cubmaster — adult, no kid in the pack
      m("cubmaster", { isYouth: false }),
    ];
  }

  it("Lion Den broadcast resolves to the parents of Lion cubs, not the cubs", () => {
    const matched = matchAutoAddRules(
      { audience: "parents-of-youth", isYouth: true, patrols: ["Lion"] },
      packMembers(),
    );
    expect(matched.map((x) => x.id).sort()).toEqual(["dad-1", "mom-1", "mom-2"]);
  });

  it("Tiger Den broadcast resolves to the single Tiger parent", () => {
    const matched = matchAutoAddRules(
      { audience: "parents-of-youth", isYouth: true, patrols: ["Tiger"] },
      packMembers(),
    );
    expect(matched.map((x) => x.id)).toEqual(["dad-3"]);
  });

  it("dedupes parents who have multiple cubs in the same den", () => {
    // Two siblings sharing both parents → broadcast should reach each
    // parent once, not twice.
    const members = [
      m("a", { isYouth: true, patrol: "Wolf", parentIds: ["p1", "p2"] }),
      m("b", { isYouth: true, patrol: "Wolf", parentIds: ["p1", "p2"] }),
      m("p1", { isYouth: false }),
      m("p2", { isYouth: false }),
    ];
    const matched = matchAutoAddRules(
      { audience: "parents-of-youth", isYouth: true, patrols: ["Wolf"] },
      members,
    );
    expect(matched.map((x) => x.id).sort()).toEqual(["p1", "p2"]);
  });

  it("returns empty when no youth match the rules (no parents to walk to)", () => {
    const matched = matchAutoAddRules(
      { audience: "parents-of-youth", isYouth: true, patrols: ["Bear"] },
      packMembers(),
    );
    expect(matched).toEqual([]);
  });

  it('default "members" audience returns matched members directly (backward compat)', () => {
    const members = packMembers();
    // Without audience set, isYouth=true + patrol filter still returns
    // the youth themselves (legacy behavior).
    const matched = matchAutoAddRules({ isYouth: true, patrols: ["Lion"] }, members);
    expect(matched.map((x) => x.id).sort()).toEqual(["lion-1", "lion-2"]);
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

  it('wraps with "parents of (...)" when audience is "parents-of-youth"', () => {
    expect(
      describeAutoAddRules({
        audience: "parents-of-youth",
        isYouth: true,
        patrols: ["Lion"],
      }),
    ).toBe("parents of (youth · patrol: Lion)");
  });
});
