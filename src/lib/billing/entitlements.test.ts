import { describe, expect, it } from "vitest";
import { entitlementsFor } from "./entitlements";

describe("entitlementsFor", () => {
  it("gives every adult Waypoint's counselor tools free, unit or not", () => {
    expect(entitlementsFor({ isYouth: false })).toEqual({ waypoint: { counselorTools: "free" } });
  });

  it("gives scouts no counselor tools", () => {
    expect(entitlementsFor({ isYouth: true }).waypoint.counselorTools).toBe("none");
  });
});
