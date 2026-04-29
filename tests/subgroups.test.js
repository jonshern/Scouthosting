import { describe, it, expect } from "vitest";
import {
  matchSubgroup,
  buildCurrentTrainingsMap,
  describeSubgroup,
} from "../lib/subgroups.js";

const members = [
  {
    id: "m1",
    firstName: "Alex",
    lastName: "Park",
    isYouth: true,
    patrol: "Eagles",
    skills: ["WFA"],
    interests: ["climbing"],
  },
  {
    id: "m2",
    firstName: "Pat",
    lastName: "Adams",
    isYouth: false,
    patrol: null,
    skills: ["mechanic", "WFA"],
    interests: [],
  },
  {
    id: "m3",
    firstName: "Sam",
    lastName: "Lee",
    isYouth: true,
    patrol: "Hawks",
    skills: [],
    interests: ["climbing"],
  },
];

describe("matchSubgroup", () => {
  it("everyone passes when no filter is set", () => {
    const out = matchSubgroup(
      { isYouth: null, patrols: [], skills: [], interests: [], trainings: [] },
      members,
    );
    expect(out).toHaveLength(3);
  });

  it("filters by isYouth=true", () => {
    const out = matchSubgroup({ isYouth: true, patrols: [], skills: [], interests: [], trainings: [] }, members);
    expect(out.map((m) => m.id).sort()).toEqual(["m1", "m3"]);
  });

  it("filters by patrol case-insensitively", () => {
    const out = matchSubgroup({ patrols: ["eagles"], skills: [], interests: [], trainings: [] }, members);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("m1");
  });

  it("filters by skill (any-of)", () => {
    const out = matchSubgroup({ patrols: [], skills: ["wfa"], interests: [], trainings: [] }, members);
    expect(out.map((m) => m.id).sort()).toEqual(["m1", "m2"]);
  });

  it("AND across filter dimensions", () => {
    const out = matchSubgroup(
      { isYouth: true, patrols: [], skills: ["wfa"], interests: [], trainings: [] },
      members,
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("m1");
  });

  it("filters by training when a training map is provided", () => {
    const trainings = [
      { memberId: "m2", courseName: "Wood Badge", expiresAt: null },
      { memberId: "m1", courseName: "Youth Protection Training", expiresAt: new Date(Date.now() - 86400000) },
    ];
    const map = buildCurrentTrainingsMap(trainings);
    const out = matchSubgroup({ trainings: ["Wood Badge"], patrols: [], skills: [], interests: [] }, members, map);
    expect(out.map((m) => m.id)).toEqual(["m2"]);
  });
});

describe("buildCurrentTrainingsMap", () => {
  it("drops expired trainings", () => {
    const now = new Date("2026-04-29T00:00:00Z");
    const map = buildCurrentTrainingsMap(
      [
        { memberId: "m1", courseName: "YPT", expiresAt: new Date("2024-01-01") },
        { memberId: "m1", courseName: "Wood Badge", expiresAt: null },
      ],
      { asOf: now },
    );
    expect(map.get("m1").has("ypt")).toBe(false);
    expect(map.get("m1").has("wood badge")).toBe(true);
  });
});

describe("describeSubgroup", () => {
  it("renders an empty subgroup as 'everyone'", () => {
    expect(describeSubgroup({})).toBe("everyone");
  });

  it("includes set fields with labels", () => {
    const s = describeSubgroup({
      isYouth: false,
      patrols: ["Eagles"],
      skills: ["WFA"],
      interests: [],
      trainings: ["Wood Badge"],
    });
    expect(s).toContain("adults");
    expect(s).toContain("patrol: Eagles");
    expect(s).toContain("skill: WFA");
    expect(s).toContain("training: Wood Badge");
  });
});
