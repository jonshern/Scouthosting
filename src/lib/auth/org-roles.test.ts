import { describe, expect, it } from "vitest";
import {
  POSITIONS,
  SUBGROUP_PRESETS,
  UNIT_TYPES,
  buildSeedBroadcastChannels,
  positionOptions,
  subgroupPresets,
  subgroupVocab,
} from "./org-roles";

describe("auth/org-roles", () => {
  it("UNIT_TYPES covers Troop / Pack / Crew / Ship / Post / GirlScoutTroop", () => {
    expect(UNIT_TYPES).toContain("Troop");
    expect(UNIT_TYPES).toContain("Pack");
    expect(UNIT_TYPES).toContain("GirlScoutTroop");
  });

  it("subgroupVocab returns Troop default for unknown unit type", () => {
    expect(subgroupVocab("Unknown" as never).singular).toBe("patrol");
    expect(subgroupVocab(null).heading).toBe("Patrols");
  });

  it("Pack has six den presets in order", () => {
    expect(SUBGROUP_PRESETS.Pack.length).toBe(6);
    expect(SUBGROUP_PRESETS.Pack[0].label).toBe("Lion");
    expect(SUBGROUP_PRESETS.Pack[5].label).toBe("Arrow of Light");
  });

  it("positionOptions returns adult-only / youth-only / union", () => {
    const adult = positionOptions("Troop", "adult");
    const youth = positionOptions("Troop", "youth");
    const union = positionOptions("Troop");
    expect(adult).toContain("Scoutmaster");
    expect(youth).toContain("Senior Patrol Leader");
    expect(union.length).toBeLessThanOrEqual(adult.length + youth.length);
  });

  it("buildSeedBroadcastChannels emits parents-of-youth audiences for Pack", () => {
    const channels = buildSeedBroadcastChannels("Pack");
    expect(channels.length).toBe(6);
    expect(channels[0].audience).toBe("parents-of-youth");
    expect(channels[0].name).toBe("Lion Den");
  });

  it("buildSeedBroadcastChannels returns [] for unit types without presets", () => {
    expect(subgroupPresets("Troop").length).toBe(0);
    expect(buildSeedBroadcastChannels("Troop")).toEqual([]);
  });

  it("POSITIONS has both adult and youth lists for every unit type", () => {
    for (const t of UNIT_TYPES) {
      expect(POSITIONS[t].adult.length).toBeGreaterThan(0);
      expect(POSITIONS[t].youth.length).toBeGreaterThan(0);
    }
  });
});
