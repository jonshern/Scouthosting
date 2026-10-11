import { describe, expect, it } from "vitest";
import { leftAtFor, scoutRecordsExpired } from "./scouts";

const now = new Date("2026-10-11T00:00:00Z");
const youth = { isYouth: true, birthdate: null, leftAt: null };

describe("scoutRecordsExpired", () => {
  it("keeps a scout who left 17 months ago, deletes at 18+", () => {
    expect(scoutRecordsExpired({ ...youth, leftAt: new Date("2025-05-15T00:00:00Z") }, "Troop", now)).toBe(false);
    expect(scoutRecordsExpired({ ...youth, leftAt: new Date("2025-04-10T00:00:00Z") }, "Troop", now)).toBe(true);
  });

  it("starts the clock at 18th birthday for troops", () => {
    // Turned 18 on 2025-04-01: 18 months later is 2026-10-01.
    expect(scoutRecordsExpired({ ...youth, birthdate: new Date("2007-04-01T00:00:00Z") }, "Troop", now)).toBe(true);
    // Turned 18 on 2025-05-01: not yet.
    expect(scoutRecordsExpired({ ...youth, birthdate: new Date("2007-05-01T00:00:00Z") }, "Troop", now)).toBe(false);
  });

  it("uses 21 for crews and ships", () => {
    const b = new Date("2007-04-01T00:00:00Z");
    expect(scoutRecordsExpired({ ...youth, birthdate: b }, "Crew", now)).toBe(false);
    expect(scoutRecordsExpired({ ...youth, birthdate: b }, "Ship", now)).toBe(false);
    expect(scoutRecordsExpired({ ...youth, birthdate: new Date("2004-04-01T00:00:00Z") }, "Crew", now)).toBe(true);
  });

  it("never touches adults, or youth with no birthdate who haven't left", () => {
    expect(scoutRecordsExpired({ isYouth: false, birthdate: new Date("1980-01-01"), leftAt: new Date("2000-01-01") }, "Troop", now)).toBe(false);
    expect(scoutRecordsExpired(youth, "Troop", now)).toBe(false);
  });
});

describe("leftAtFor", () => {
  it("stamps when a member becomes alumni, keeps the stamp, clears on return", () => {
    const t = new Date("2026-01-01T00:00:00Z");
    expect(leftAtFor({ status: "active", leftAt: null }, "alumni", now)).toEqual(now);
    expect(leftAtFor({ status: "alumni", leftAt: t }, "alumni", now)).toEqual(t);
    expect(leftAtFor({ status: "alumni", leftAt: t }, "active", now)).toBeNull();
    expect(leftAtFor(null, "alumni", now)).toEqual(now);
  });
});
