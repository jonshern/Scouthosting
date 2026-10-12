import { describe, expect, it } from "vitest";
import {
  CreateScoutBody,
  Custom,
  MAX_PATH,
  PatchScoutBody,
  Path,
  ProgressBody,
  ProgressKey,
  lastChangePerKey,
} from "./schema";

describe("journey keys", () => {
  it("accepts items, steps and Lantern's own steps", () => {
    for (const k of [
      "rank:scout",
      "rank:second-class#1a",
      "badge:plumbing#6b",
      "badge:first-aid#5b-optA",
      "award:arrow-of-light#2",
      "custom:k3x9a1",
      "custom:k3x9a1#2",
    ]) {
      expect(ProgressKey.safeParse(k).success, k).toBe(true);
    }
  });

  it("rejects anything else", () => {
    for (const k of ["", "rank", "rank:", "Rank:scout", "rank:Scout", "rank:scout#", "rank:scout#a1", "merit:camping", "rank:scout#1 a", "badge:x#1/2"]) {
      expect(ProgressKey.safeParse(k).success, k).toBe(false);
    }
  });
});

describe("Path", () => {
  it("takes item keys in order without repeats", () => {
    expect(Path.parse(["rank:scout", "badge:camping", "custom:a1"])).toEqual(["rank:scout", "badge:camping", "custom:a1"]);
    expect(Path.safeParse(["rank:scout", "rank:scout"]).success).toBe(false);
    expect(Path.safeParse(["rank:scout#1a"]).success).toBe(false);
    expect(Path.safeParse(Array.from({ length: MAX_PATH + 1 }, (_, i) => `custom:a${i}`)).success).toBe(false);
  });
});

describe("Custom", () => {
  const item = { key: "custom:a1", name: "Fix the bike", kind: "custom", reqs: [{ n: "1", t: "Patch the tube", subs: [] }] };
  it("takes the app's custom step shape", () => {
    expect(Custom.parse({ "custom:a1": item })["custom:a1"]!.name).toBe("Fix the bike");
  });
  it("needs custom keys that match their entry", () => {
    expect(Custom.safeParse({ "custom:b2": item }).success).toBe(false);
    expect(Custom.safeParse({ "badge:camping": { ...item, key: "badge:camping" } }).success).toBe(false);
  });
});

describe("bodies", () => {
  it("trims names and refuses empty ones", () => {
    expect(CreateScoutBody.parse({ name: "  Emmett " }).name).toBe("Emmett");
    expect(CreateScoutBody.safeParse({ name: "   " }).success).toBe(false);
    expect(CreateScoutBody.safeParse({ name: "x".repeat(61) }).success).toBe(false);
  });

  it("takes imported progress as day or true", () => {
    const b = CreateScoutBody.parse({ name: "E", progress: { "rank:scout": true, "rank:second-class#1a": "2026-10-11" } });
    expect(b.progress).toEqual({ "rank:scout": true, "rank:second-class#1a": "2026-10-11" });
    expect(CreateScoutBody.safeParse({ name: "E", progress: { "rank:scout": false } }).success).toBe(false);
    expect(CreateScoutBody.safeParse({ name: "E", progress: { "rank:scout": "yesterday" } }).success).toBe(false);
  });

  it("needs something to change", () => {
    expect(PatchScoutBody.safeParse({}).success).toBe(false);
    expect(PatchScoutBody.safeParse({ memberId: null }).success).toBe(true);
  });

  it("needs at least one progress change", () => {
    expect(ProgressBody.safeParse({ changes: [] }).success).toBe(false);
    expect(ProgressBody.safeParse({ changes: [{ key: "rank:scout", done: true, on: "2026-10-11" }] }).success).toBe(true);
  });
});

describe("lastChangePerKey", () => {
  it("keeps the last change for each key", () => {
    const out = lastChangePerKey([
      { key: "rank:scout#1a", done: true },
      { key: "rank:scout#1b", done: true },
      { key: "rank:scout#1a", done: false },
    ]);
    expect(out).toEqual([
      { key: "rank:scout#1b", done: true },
      { key: "rank:scout#1a", done: false },
    ]);
  });
});
