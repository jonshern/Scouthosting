import { describe, expect, it } from "vitest";
import { changesTreasurerAccess, treasuryAllowed } from "./treasury-access";

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

describe("changesTreasurerAccess", () => {
  it("flags a new roster row with a treasurer position", () => {
    expect(changesTreasurerAccess(null, { position: "Treasurer", email: "a@x.test" })).toBe(true);
    expect(changesTreasurerAccess(null, { position: "Scoutmaster", email: "a@x.test" })).toBe(false);
  });

  it("flags giving, removing or re-pointing a treasurer position", () => {
    const leader = { position: "Assistant Scoutmaster", email: "me@x.test" };
    const treasurer = { position: "Treasurer", email: "t@x.test" };
    expect(changesTreasurerAccess(leader, { position: "Purser", email: "me@x.test" })).toBe(true);
    expect(changesTreasurerAccess(treasurer, { position: "Scoutmaster", email: "t@x.test" })).toBe(true);
    expect(changesTreasurerAccess(treasurer, { position: "Treasurer", email: "me@x.test" })).toBe(true);
  });

  it("allows edits that leave treasurer access alone", () => {
    const treasurer = { position: "Treasurer", email: "t@x.test" };
    expect(changesTreasurerAccess(treasurer, { position: " treasurer ", email: "T@x.test" })).toBe(false);
    expect(changesTreasurerAccess(treasurer, {})).toBe(false);
    expect(changesTreasurerAccess({ position: "Scoutmaster", email: "a@x.test" }, { email: "b@x.test" })).toBe(false);
  });
});
