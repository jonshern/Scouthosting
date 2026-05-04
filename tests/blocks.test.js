// Smoke tests for the live-block registry. Per-block fetch + render
// are integration-shaped (need real Prisma); these cover normalise()
// and registry membership so a typo in a config field doesn't ship
// silently.

import { describe, it, expect } from "vitest";
import {
  LIVE_BLOCK_TYPES,
  isLiveBlockType,
  getLiveBlockSpec,
  normaliseLiveBlockConfig,
} from "../lib/blocks/index.js";

describe("live-block registry", () => {
  it("registers all live block types", () => {
    expect(LIVE_BLOCK_TYPES.events).toBeTruthy();
    expect(LIVE_BLOCK_TYPES.photos).toBeTruthy();
    expect(LIVE_BLOCK_TYPES.posts).toBeTruthy();
    expect(LIVE_BLOCK_TYPES.contact).toBeTruthy();
    expect(LIVE_BLOCK_TYPES.calendar).toBeTruthy();
    expect(LIVE_BLOCK_TYPES.survey).toBeTruthy();
  });

  it("isLiveBlockType discriminates known + unknown", () => {
    expect(isLiveBlockType("events")).toBe(true);
    expect(isLiveBlockType("calendar")).toBe(true);
    expect(isLiveBlockType("survey")).toBe(true);
    expect(isLiveBlockType("ghost")).toBe(false);
  });

  it("each spec has a render() and fetch()", () => {
    for (const type of Object.keys(LIVE_BLOCK_TYPES)) {
      const spec = getLiveBlockSpec(type);
      expect(typeof spec.render).toBe("function");
      expect(typeof spec.fetch).toBe("function");
    }
  });
});

describe("calendar block normalise", () => {
  it("clamps monthsAhead to 0–3", () => {
    expect(normaliseLiveBlockConfig("calendar", { monthsAhead: -5 })).toMatchObject({ monthsAhead: 0 });
    expect(normaliseLiveBlockConfig("calendar", { monthsAhead: 99 })).toMatchObject({ monthsAhead: 3 });
    expect(normaliseLiveBlockConfig("calendar", { monthsAhead: "2" })).toMatchObject({ monthsAhead: 2 });
  });

  it("falls back to grid layout on unknown values", () => {
    expect(normaliseLiveBlockConfig("calendar", { layout: "wallpaper" })).toMatchObject({ layout: "grid" });
    expect(normaliseLiveBlockConfig("calendar", { layout: "list" })).toMatchObject({ layout: "list" });
  });
});

describe("survey block normalise", () => {
  it("strips invalid characters from surveySlug + lowercases", () => {
    expect(normaliseLiveBlockConfig("survey", { surveySlug: "Welcome Packet!" })).toMatchObject({
      surveySlug: "welcomepacket",
    });
    expect(normaliseLiveBlockConfig("survey", { surveySlug: "valid-slug-123" })).toMatchObject({
      surveySlug: "valid-slug-123",
    });
  });

  it("clamps slug length to 60 chars", () => {
    const long = "a".repeat(120);
    const out = normaliseLiveBlockConfig("survey", { surveySlug: long });
    expect(out.surveySlug.length).toBeLessThanOrEqual(60);
  });

  it("returns empty string for missing slug", () => {
    expect(normaliseLiveBlockConfig("survey", {})).toMatchObject({ surveySlug: "" });
  });
});
