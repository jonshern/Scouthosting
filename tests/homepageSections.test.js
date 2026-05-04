// Homepage block-validation tests. The CMS no longer has a "section
// plan" concept — Page.customBlocks array order is the single source
// of truth for layout. These tests cover what's left: block-type
// registration and per-block normalisation.

import { describe, it, expect } from "vitest";
import {
  BLOCK_TYPES,
  isLiveBlockType,
  readCustomBlocks,
  normaliseCustomBlock,
} from "../lib/homepageSections.js";

describe("BLOCK_TYPES registry", () => {
  it("registers the static block types", () => {
    expect(BLOCK_TYPES.text).toBeTruthy();
    expect(BLOCK_TYPES.image).toBeTruthy();
    expect(BLOCK_TYPES.cta).toBeTruthy();
  });

  it("registers the live block types", () => {
    expect(BLOCK_TYPES.events).toBeTruthy();
    expect(BLOCK_TYPES.photos).toBeTruthy();
    expect(BLOCK_TYPES.posts).toBeTruthy();
    expect(BLOCK_TYPES.contact).toBeTruthy();
  });

  it("isLiveBlockType discriminates static from live", () => {
    expect(isLiveBlockType("text")).toBe(false);
    expect(isLiveBlockType("events")).toBe(true);
    expect(isLiveBlockType("ghost")).toBe(false);
  });
});

describe("readCustomBlocks", () => {
  it("returns [] when missing or wrong type", () => {
    expect(readCustomBlocks(null)).toEqual([]);
    expect(readCustomBlocks({})).toEqual([]);
    expect(readCustomBlocks({ customBlocks: "garbage" })).toEqual([]);
  });

  it("drops rows missing id or unknown type (renderer would skip them anyway)", () => {
    const page = {
      customBlocks: [
        { id: "a", type: "text", title: "ok", body: "ok" },
        { type: "text" },
        { id: "b", type: "ghost" },
        { id: "c", type: "image", filename: "p.jpg" },
      ],
    };
    const out = readCustomBlocks(page);
    expect(out.map((b) => b.id)).toEqual(["a", "c"]);
  });
});

describe("normaliseCustomBlock", () => {
  it("clamps text fields to their max lengths", () => {
    const out = normaliseCustomBlock({
      id: "a",
      type: "text",
      title: "x".repeat(200),
      body: "y".repeat(10000),
    });
    expect(out.title.length).toBe(120);
    expect(out.body.length).toBe(8000);
  });

  it("normalises CTA fields", () => {
    const out = normaliseCustomBlock({
      id: "a",
      type: "cta",
      title: "Join",
      body: "Come visit",
      buttonLabel: "Visit us",
      buttonLink: "/join",
    });
    expect(out).toMatchObject({
      id: "a",
      type: "cta",
      title: "Join",
      buttonLabel: "Visit us",
      buttonLink: "/join",
    });
  });

  it("normalises live-block config under .config", () => {
    const out = normaliseCustomBlock({
      id: "a",
      type: "events",
      config: { limit: 5, layout: "list" },
    });
    expect(out.id).toBe("a");
    expect(out.type).toBe("events");
    expect(out.config).toBeTruthy();
  });

  it("throws on unknown type / missing id", () => {
    expect(() => normaliseCustomBlock({ id: "a", type: "ghost" })).toThrow(/Unknown block type/);
    expect(() => normaliseCustomBlock({ type: "text" })).toThrow(/block id required/);
    expect(() => normaliseCustomBlock(null)).toThrow();
  });
});
