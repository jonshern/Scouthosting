// orgRoles vocabulary tests. The rules:
//
//   - Cub Scout Packs use dens with a fixed canonical list.
//   - Scouts BSA Troops use patrols with free-form names.
//   - Every unit type has a leadership-position list with "Other" as a
//     fallback so admins can record custom titles.
//   - Adult positions always include the unit-leader role + Committee
//     Chair so the YPT two-deep check has well-known anchor positions.

import { describe, it, expect } from "vitest";
import {
  SUBGROUP_PRESETS,
  POSITIONS,
  subgroupVocab,
  subgroupPresets,
  positionOptions,
  hasFixedSubgroups,
} from "../lib/orgRoles.js";

describe("subgroupVocab", () => {
  it("uses 'den' for Cub Scout Packs and 'patrol' for Troops", () => {
    expect(subgroupVocab("Pack").singular).toBe("den");
    expect(subgroupVocab("Pack").plural).toBe("dens");
    expect(subgroupVocab("Troop").singular).toBe("patrol");
    expect(subgroupVocab("Troop").plural).toBe("patrols");
  });

  it("falls back to Troop vocabulary on unknown unit type (defensive)", () => {
    expect(subgroupVocab("Foo").singular).toBe("patrol");
  });
});

describe("subgroupPresets", () => {
  it("locks the six Cub Scout dens in age order", () => {
    const presets = subgroupPresets("Pack");
    const labels = presets.map((p) => p.label);
    expect(labels).toEqual(["Lion", "Tiger", "Wolf", "Bear", "Webelos", "Arrow of Light"]);
  });

  it("each preset has a key, label, and grade", () => {
    for (const p of SUBGROUP_PRESETS.Pack) {
      expect(p).toHaveProperty("key");
      expect(p).toHaveProperty("label");
      expect(p).toHaveProperty("grade");
    }
  });

  it("Troops get an empty preset list (free-form patrol names)", () => {
    expect(subgroupPresets("Troop")).toEqual([]);
  });

  it("hasFixedSubgroups is true for Pack and false for Troop", () => {
    expect(hasFixedSubgroups("Pack")).toBe(true);
    expect(hasFixedSubgroups("Troop")).toBe(false);
    expect(hasFixedSubgroups("Crew")).toBe(false);
  });
});

describe("positionOptions", () => {
  it("Pack adult positions include Cubmaster + Den Leader + Committee Chair", () => {
    const adults = positionOptions("Pack", "adult");
    expect(adults).toContain("Cubmaster");
    expect(adults).toContain("Den Leader");
    expect(adults).toContain("Committee Chair");
    expect(adults[adults.length - 1]).toBe("Other");
  });

  it("Troop adult positions include Scoutmaster + ASM + Committee Chair", () => {
    const adults = positionOptions("Troop", "adult");
    expect(adults).toContain("Scoutmaster");
    expect(adults).toContain("Assistant Scoutmaster");
    expect(adults).toContain("Committee Chair");
    expect(adults[adults.length - 1]).toBe("Other");
  });

  it("Troop youth positions include SPL + PL + Den Chief", () => {
    const youth = positionOptions("Troop", "youth");
    expect(youth).toContain("Senior Patrol Leader");
    expect(youth).toContain("Patrol Leader");
    expect(youth).toContain("Den Chief");
    expect(youth[youth.length - 1]).toBe("Other");
  });

  it("Ship uses Skipper / Mate / Boatswain naming", () => {
    expect(positionOptions("Ship", "adult")).toContain("Skipper");
    expect(positionOptions("Ship", "youth")).toContain("Boatswain");
  });

  it("Crew uses Advisor / Crew President", () => {
    expect(positionOptions("Crew", "adult")).toContain("Crew Advisor");
    expect(positionOptions("Crew", "youth")).toContain("Crew President");
  });

  it("merges adult + youth when no audience is specified", () => {
    const all = positionOptions("Troop");
    expect(all).toContain("Scoutmaster");
    expect(all).toContain("Senior Patrol Leader");
  });

  it("falls back to Troop on unknown unit type", () => {
    expect(positionOptions("Foo", "adult")).toContain("Scoutmaster");
  });

  it("every unit type has 'Other' as a free-form fallback", () => {
    for (const ut of Object.keys(POSITIONS)) {
      expect(POSITIONS[ut].adult).toContain("Other");
      expect(POSITIONS[ut].youth).toContain("Other");
    }
  });
});
