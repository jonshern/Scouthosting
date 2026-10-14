import { describe, expect, it } from "vitest";
import { pickScout, ScoutLookupError, type AccessibleScout } from "./scouts";

const scout = (id: string, firstName: string, lastInitial: string, relation: "family" | "leader"): AccessibleScout => ({
  id,
  memberId: id,
  journeyId: null,
  orgId: "org",
  orgSlug: "troop",
  orgName: "Troop 100",
  firstName,
  lastInitial,
  label: `${firstName} ${lastInitial}.`,
  patrol: null,
  relation,
  role: "leader",
});

const emmett = scout("m1", "Emmett", "S", "family");
const otherEmmett = scout("m2", "Emmett", "B", "leader");
const ben = scout("m3", "Ben", "K", "leader");
const all = [emmett, otherEmmett, ben];

describe("pickScout", () => {
  it("prefers the adult's own child on a name clash", () => {
    expect(pickScout(all, "Emmett")).toBe(emmett);
    expect(pickScout(all, "emmett b")).toBe(otherEmmett);
    expect(pickScout(all, "Emmett B.")).toBe(otherEmmett);
  });

  it("uses the only family scout when no name is given", () => {
    expect(pickScout(all, undefined)).toBe(emmett);
  });

  it("finds by id", () => {
    expect(pickScout(all, "m3")).toBe(ben);
  });

  it("refuses names it can't see, listing only family", () => {
    try {
      pickScout(all, "Zed");
      throw new Error("expected a lookup error");
    } catch (err) {
      expect(err).toBeInstanceOf(ScoutLookupError);
      expect((err as ScoutLookupError).choices).toEqual([emmett]);
    }
  });

  it("asks which when several match", () => {
    const twin = scout("m4", "Emmett", "S", "family");
    expect(() => pickScout([emmett, twin], "Emmett")).toThrow(/More than one/);
  });

  it("explains an account with no scouts", () => {
    expect(() => pickScout([], "Emmett")).toThrow(/No scouts are linked/);
  });
});
