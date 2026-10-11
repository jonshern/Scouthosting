import { describe, expect, it } from "vitest";
import { treasuryAllowed } from "./treasury-access";

describe("treasuryAllowed", () => {
  it("lets admins and super-admins in", () => {
    expect(treasuryAllowed("admin", [])).toBe(true);
    expect(treasuryAllowed(null, [], true)).toBe(true);
  });

  it("lets a leader in only with a treasurer position", () => {
    expect(treasuryAllowed("leader", ["Treasurer"])).toBe(true);
    expect(treasuryAllowed("leader", ["  cookie   manager "])).toBe(true);
    expect(treasuryAllowed("leader", ["Assistant Scoutmaster", "Purser"])).toBe(true);
    expect(treasuryAllowed("leader", ["Scoutmaster"])).toBe(false);
    expect(treasuryAllowed("leader", [null])).toBe(false);
    expect(treasuryAllowed("leader", [])).toBe(false);
  });

  it("keeps parents and scouts out even with a treasurer position", () => {
    expect(treasuryAllowed("parent", ["Treasurer"])).toBe(false);
    expect(treasuryAllowed("scout", ["Treasurer"])).toBe(false);
    expect(treasuryAllowed(null, ["Treasurer"])).toBe(false);
  });
});
