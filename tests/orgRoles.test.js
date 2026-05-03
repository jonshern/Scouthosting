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
  UNIT_TYPES,
  SUBGROUP_PRESETS,
  POSITIONS,
  subgroupVocab,
  subgroupPresets,
  positionOptions,
  buildSeedBroadcastChannels,
} from "../lib/orgRoles.js";

describe("subgroupVocab", () => {
  it("uses 'den' for Cub Scout Packs and 'patrol' for Troops", () => {
    expect(subgroupVocab("Pack").singular).toBe("den");
    expect(subgroupVocab("Pack").plural).toBe("dens");
    expect(subgroupVocab("Troop").singular).toBe("patrol");
    expect(subgroupVocab("Troop").plural).toBe("patrols");
  });

  it("uses 'level' for Girl Scout troops", () => {
    expect(subgroupVocab("GirlScoutTroop").singular).toBe("level");
    expect(subgroupVocab("GirlScoutTroop").plural).toBe("levels");
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

  it("locks the six Girl Scout levels in age order", () => {
    const presets = subgroupPresets("GirlScoutTroop");
    const labels = presets.map((p) => p.label);
    expect(labels).toEqual([
      "Daisy",
      "Brownie",
      "Junior",
      "Cadette",
      "Senior",
      "Ambassador",
    ]);
  });
});

describe("UNIT_TYPES export", () => {
  it("includes every program Compass supports", () => {
    expect(UNIT_TYPES).toContain("Troop");
    expect(UNIT_TYPES).toContain("Pack");
    expect(UNIT_TYPES).toContain("GirlScoutTroop");
  });

  it("is frozen so consumers can't accidentally mutate the canonical list", () => {
    expect(Object.isFrozen(UNIT_TYPES)).toBe(true);
  });
});

describe("buildSeedBroadcastChannels (pure DTO builder, no DB)", () => {
  it("builds six den DTOs for a Pack with patrol filter set", () => {
    const seeds = buildSeedBroadcastChannels("Pack");
    expect(seeds).toHaveLength(6);
    const lion = seeds.find((s) => s.name === "Lion Den");
    expect(lion.patrols).toEqual(["Lion"]);
    expect(lion.isYouth).toBe(true);
    expect(lion.description).toMatch(/Lion \(K\)/);
  });

  it("builds six level DTOs for a Girl Scout Troop", () => {
    const seeds = buildSeedBroadcastChannels("GirlScoutTroop");
    expect(seeds.map((s) => s.name)).toContain("Daisy Level");
    expect(seeds.map((s) => s.name)).toContain("Ambassador Level");
  });

  it("returns [] for free-form unit types (Troop, Crew, Ship, Post)", () => {
    for (const ut of ["Troop", "Crew", "Ship", "Post"]) {
      expect(buildSeedBroadcastChannels(ut)).toEqual([]);
    }
  });

  it("DTO has no orgId — caller is responsible for adding it", () => {
    for (const s of buildSeedBroadcastChannels("Pack")) {
      expect(s).not.toHaveProperty("orgId");
    }
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

  it("Girl Scouts use Troop Leader / Co-Leader / Cookie Manager", () => {
    const adults = positionOptions("GirlScoutTroop", "adult");
    expect(adults).toContain("Troop Leader");
    expect(adults).toContain("Co-Leader");
    expect(adults).toContain("Cookie Manager");
    expect(adults).toContain("Service Unit Manager");
    const youth = positionOptions("GirlScoutTroop", "youth");
    expect(youth).toContain("Troop President");
    expect(youth).toContain("Patrol Leader");
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

