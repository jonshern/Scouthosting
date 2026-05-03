// Backfill-script logic tests. The script itself talks to a live DB so
// it's hard to integration-test without a fixture. The interesting bit
// is the rule-extraction — turning a Subgroup row into the JSON that
// goes into Channel.autoAddRules. Pin that here.
//
// We re-implement the rule extraction inline to avoid making the
// script importable (it has top-level await on prisma which would run
// at import time). Keep this in lockstep with the script.

import { describe, it, expect } from "vitest";

function rulesFromSubgroup(sg) {
  const rules = {};
  if (sg.isYouth != null) rules.isYouth = sg.isYouth;
  if (sg.patrols?.length) rules.patrols = sg.patrols;
  if (sg.skills?.length) rules.skills = sg.skills;
  if (sg.interests?.length) rules.interests = sg.interests;
  if (sg.trainings?.length) rules.trainings = sg.trainings;
  return Object.keys(rules).length ? rules : null;
}

describe("rulesFromSubgroup", () => {
  it("returns null for a Subgroup with no filters set (everyone)", () => {
    expect(rulesFromSubgroup({ name: "Everyone", patrols: [], skills: [], interests: [], trainings: [] })).toBeNull();
  });

  it("preserves isYouth=true (youth-only subgroup)", () => {
    expect(rulesFromSubgroup({ isYouth: true })).toEqual({ isYouth: true });
  });

  it("preserves isYouth=false (adults-only subgroup)", () => {
    expect(rulesFromSubgroup({ isYouth: false })).toEqual({ isYouth: false });
  });

  it("drops isYouth when null (don't filter on age)", () => {
    expect(rulesFromSubgroup({ isYouth: null, patrols: ["Wolves"] })).toEqual({ patrols: ["Wolves"] });
  });

  it("drops empty arrays", () => {
    expect(
      rulesFromSubgroup({
        isYouth: null,
        patrols: ["Wolves"],
        skills: [],
        interests: [],
        trainings: [],
      }),
    ).toEqual({ patrols: ["Wolves"] });
  });

  it("preserves all populated dimensions", () => {
    expect(
      rulesFromSubgroup({
        isYouth: true,
        patrols: ["Wolves", "Tigers"],
        skills: ["first-aid"],
        interests: ["camping"],
        trainings: ["Hazardous Weather"],
      }),
    ).toEqual({
      isYouth: true,
      patrols: ["Wolves", "Tigers"],
      skills: ["first-aid"],
      interests: ["camping"],
      trainings: ["Hazardous Weather"],
    });
  });

  it("returns null when only empty arrays + null isYouth (semantically 'everyone')", () => {
    // describeSubgroup() in lib/subgroups.js calls this case "everyone"
    // — autoAddRules=null on Channel matches that semantic for "no
    // rules; manual or all-org membership."
    expect(rulesFromSubgroup({ isYouth: null, patrols: [], skills: [], interests: [], trainings: [] })).toBeNull();
  });
});
