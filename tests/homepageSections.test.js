// Homepage CMS section-plan tests.

import { describe, it, expect } from "vitest";
import {
  SECTIONS,
  DEFAULT_ORDER,
  resolvePlan,
  normaliseSectionPatch,
  readTestimonials,
} from "../lib/homepageSections.js";

describe("resolvePlan", () => {
  it("returns the default order when the page has no overrides", () => {
    expect(resolvePlan(null)).toEqual([...DEFAULT_ORDER]);
    expect(resolvePlan({})).toEqual([...DEFAULT_ORDER]);
  });

  it("respects a custom order", () => {
    const plan = resolvePlan({
      sectionOrder: ["hero", "join", "about"],
    });
    // Custom keys come first, then any not-yet-listed defaults.
    expect(plan.slice(0, 3)).toEqual(["hero", "join", "about"]);
    expect(plan).toContain("upcoming");
    expect(plan).toContain("contact");
  });

  it("filters out invisible sections", () => {
    const plan = resolvePlan({
      sectionVisibility: { posts: false, contact: false },
    });
    expect(plan).not.toContain("posts");
    expect(plan).not.toContain("contact");
    expect(plan).toContain("hero");
  });

  it("drops unknown section keys silently (rename-safe)", () => {
    const plan = resolvePlan({
      sectionOrder: ["hero", "ghostSection", "about"],
    });
    expect(plan).not.toContain("ghostSection");
    expect(plan).toContain("hero");
    expect(plan).toContain("about");
  });
});

describe("normaliseSectionPatch", () => {
  it("returns only the supplied subset (missing keys leave existing alone)", () => {
    const out = normaliseSectionPatch({ visibility: { posts: false } });
    expect(out).toEqual({ sectionVisibility: { posts: false } });
  });

  it("coerces visibility values to booleans (form posts arrive as strings)", () => {
    const out = normaliseSectionPatch({ visibility: { hero: "true", contact: "" } });
    expect(out.sectionVisibility).toEqual({ hero: true, contact: false });
  });

  it("throws on unknown section keys (loud failure on tampered input)", () => {
    expect(() => normaliseSectionPatch({ order: ["hero", "evil"] })).toThrow(/Unknown section/);
    expect(() => normaliseSectionPatch({ visibility: { evil: true } })).toThrow(/Unknown section/);
  });

  it("throws when order is not an array", () => {
    expect(() => normaliseSectionPatch({ order: "hero,about" })).toThrow();
  });
});

describe("readTestimonials", () => {
  it("parses well-formed rows", () => {
    const page = {
      testimonialsJson: [
        { quote: "Great unit", attribution: "— Mom" },
        { quote: "My son loves it" },
      ],
    };
    expect(readTestimonials(page)).toEqual([
      { quote: "Great unit", attribution: "— Mom" },
      { quote: "My son loves it", attribution: "" },
    ]);
  });

  it("filters malformed rows", () => {
    const page = {
      testimonialsJson: [{ quote: "ok" }, "string", null, { attribution: "no-quote" }],
    };
    expect(readTestimonials(page)).toEqual([{ quote: "ok", attribution: "" }]);
  });

  it("returns [] when missing or wrong type", () => {
    expect(readTestimonials(null)).toEqual([]);
    expect(readTestimonials({ testimonialsJson: null })).toEqual([]);
    expect(readTestimonials({ testimonialsJson: "garbage" })).toEqual([]);
  });
});

describe("SECTIONS registry", () => {
  it("every section in DEFAULT_ORDER is registered", () => {
    for (const k of DEFAULT_ORDER) expect(SECTIONS[k]).toBeTruthy();
  });

  it("is frozen so consumers can't mutate the registry", () => {
    expect(Object.isFrozen(SECTIONS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_ORDER)).toBe(true);
  });
});
