import { describe, expect, it } from "vitest";
import { reservedDomain } from "./custom-domain";

const opts = {
  apexHost: "compass.app",
  extraHosts: "jons-mac.local",
  webOrigins: new Set(["https://waypoint.example.org"]),
};

describe("reservedDomain", () => {
  it("refuses our own hosts", () => {
    expect(reservedDomain("compass.app", opts)).toBe(true);
    expect(reservedDomain("troop12.compass.app", opts)).toBe(true);
    expect(reservedDomain("jons-mac.local", opts)).toBe(true);
    expect(reservedDomain("waypoint.example.org", opts)).toBe(true);
  });

  it("refuses shared platform hosts", () => {
    expect(reservedDomain("core-prod-abc.a.run.app", opts)).toBe(true);
    expect(reservedDomain("jons-mac.tail1234.ts.net", opts)).toBe(true);
    expect(reservedDomain("bluecard.web.app", opts)).toBe(true);
  });

  it("allows a unit's own domain", () => {
    expect(reservedDomain("troop12.org", opts)).toBe(false);
    expect(reservedDomain("notcompass.app", opts)).toBe(false);
  });
});
