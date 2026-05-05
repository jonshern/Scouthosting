import { describe, expect, it } from "vitest";
import { deriveSlug, isReservedSlug, isValidSlug } from "./slug";

describe("deriveSlug", () => {
  it("lowercases + concatenates type and number", () => {
    expect(deriveSlug("Troop", "100")).toBe("troop100");
    expect(deriveSlug("Pack", "577")).toBe("pack577");
    expect(deriveSlug("Crew", "42a")).toBe("crew42a");
  });
  it("strips non-alphanumeric from the number", () => {
    expect(deriveSlug("Troop", "100-A")).toBe("troop100a");
  });
});

describe("isReservedSlug", () => {
  it("rejects www / admin / api", () => {
    expect(isReservedSlug("www")).toBe(true);
    expect(isReservedSlug("admin")).toBe(true);
    expect(isReservedSlug("api")).toBe(true);
  });
  it("permits ordinary unit slugs", () => {
    expect(isReservedSlug("troop100")).toBe(false);
  });
});

describe("isValidSlug", () => {
  it("accepts dns-safe lowercase slugs", () => {
    expect(isValidSlug("troop100")).toBe(true);
    expect(isValidSlug("a")).toBe(true);
    expect(isValidSlug("a-b-c")).toBe(true);
  });
  it("rejects invalid characters or shapes", () => {
    expect(isValidSlug("Troop100")).toBe(false);
    expect(isValidSlug("-leading")).toBe(false);
    expect(isValidSlug("trailing-")).toBe(false);
    expect(isValidSlug("with.dot")).toBe(false);
  });
});
