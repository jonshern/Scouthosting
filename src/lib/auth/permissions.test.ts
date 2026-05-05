import { describe, expect, it } from "vitest";
import {
  SCOPES,
  checkScope,
  positionHasScope,
  scopesForPosition,
  scopesForPositions,
} from "./permissions";

describe("auth/permissions/scopesForPosition", () => {
  it("normalises whitespace + case", () => {
    expect(scopesForPosition("  Scoutmaster ").has(SCOPES.UNIT_LEADER)).toBe(true);
    expect(scopesForPosition("CUBMASTER").has(SCOPES.UNIT_LEADER)).toBe(true);
  });

  it("Committee Chair grants both committee-chair and committee", () => {
    const s = scopesForPosition("Committee Chair");
    expect(s.has(SCOPES.COMMITTEE_CHAIR)).toBe(true);
    expect(s.has(SCOPES.COMMITTEE)).toBe(true);
  });

  it("returns empty for unknown / blank positions", () => {
    expect(scopesForPosition("").size).toBe(0);
    expect(scopesForPosition("Random Made Up Title").size).toBe(0);
    expect(scopesForPosition(null).size).toBe(0);
  });

  it("scopesForPositions unions the scopes across positions", () => {
    const s = scopesForPositions(["Committee Chair", "Treasurer"]);
    expect(s.has(SCOPES.COMMITTEE_CHAIR)).toBe(true);
    expect(s.has(SCOPES.TREASURER)).toBe(true);
  });

  it("positionHasScope is convenience for the Set lookup", () => {
    expect(positionHasScope("Den Leader", SCOPES.PATROL_LEADER)).toBe(true);
    expect(positionHasScope("Den Leader", SCOPES.TREASURER)).toBe(false);
  });
});

describe("auth/permissions/checkScope", () => {
  it("admin always passes", () => {
    expect(checkScope({ role: "admin" }, SCOPES.TREASURER).ok).toBe(true);
  });

  it("leader passes broad scopes (UNIT_LEADER) without a position", () => {
    expect(checkScope({ role: "leader" }, SCOPES.UNIT_LEADER).ok).toBe(true);
  });

  it("leader is gated on narrow scopes (TREASURER) without the position", () => {
    const r = checkScope({ role: "leader" }, SCOPES.TREASURER);
    expect(r.ok).toBe(false);
  });

  it("leader with Treasurer position passes treasurer scope", () => {
    const r = checkScope({ role: "leader", position: "Treasurer" }, SCOPES.TREASURER);
    expect(r.ok).toBe(true);
  });

  it("parent without position can't access leader-tier scopes", () => {
    expect(checkScope({ role: "parent" }, SCOPES.UNIT_LEADER).ok).toBe(false);
  });

  it("any of multiple wanted scopes is enough (OR semantics)", () => {
    expect(
      checkScope({ role: "leader", position: "Treasurer" }, SCOPES.TREASURER, SCOPES.SECRETARY).ok,
    ).toBe(true);
  });

  it("empty wanted list passes (no-op)", () => {
    expect(checkScope({ role: "parent" }).ok).toBe(true);
  });
});
