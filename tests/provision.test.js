// Provision helpers — slug + display-name derivation per unit type.
//
// The slug becomes the public subdomain (troop12.compass.app), so the
// derivation rules need to be deterministic, collision-resistant across
// programs (Scouts BSA Troop 12 + Girl Scout Troop 12 must coexist),
// and produce something a human typing it on the phone can hit on
// the first try.

import { describe, it, expect } from "vitest";
import { deriveSlug, formatDisplayName, validateProvisionInput } from "../server/provision.js";

describe("deriveSlug", () => {
  it("Scouts BSA Troop → troop<n>", () => {
    expect(deriveSlug("Troop", "12")).toBe("troop12");
  });

  it("Cub Scout Pack → pack<n>", () => {
    expect(deriveSlug("Pack", "42")).toBe("pack42");
  });

  it("Girl Scout Troop → gstroop<n> (no collision with BSA Troop)", () => {
    expect(deriveSlug("GirlScoutTroop", "12")).toBe("gstroop12");
    // Same number, different program — different subdomains.
    expect(deriveSlug("Troop", "12")).not.toBe(deriveSlug("GirlScoutTroop", "12"));
  });

  it("strips internal whitespace from the unit number", () => {
    expect(deriveSlug("Troop", "1 2")).toBe("troop12");
  });
});

describe("formatDisplayName", () => {
  it("Troop / Pack / Crew use their bare label", () => {
    expect(formatDisplayName("Troop", "12")).toBe("Troop 12");
    expect(formatDisplayName("Pack", "42")).toBe("Pack 42");
    expect(formatDisplayName("Crew", "7")).toBe("Crew 7");
  });

  it("GirlScoutTroop displays as 'Girl Scout Troop'", () => {
    expect(formatDisplayName("GirlScoutTroop", "12")).toBe("Girl Scout Troop 12");
  });
});

describe("validateProvisionInput unit-type whitelist", () => {
  const baseValid = {
    unitType: "Troop",
    unitNumber: "12",
    charterOrg: "St. Mark's",
    city: "Anytown",
    state: "ST",
    scoutmasterName: "Jen S.",
    scoutmasterEmail: "jen@example.com",
  };

  it("accepts every supported unit type including GirlScoutTroop", () => {
    for (const ut of ["Troop", "Pack", "Crew", "Ship", "Post", "GirlScoutTroop"]) {
      const errs = validateProvisionInput({ ...baseValid, unitType: ut });
      expect(errs).toEqual([]);
    }
  });

  it("rejects unknown unit types", () => {
    const errs = validateProvisionInput({ ...baseValid, unitType: "BoyScoutTroop" });
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0]).toMatch(/unitType/);
  });
});
