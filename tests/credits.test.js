import { describe, it, expect } from "vitest";
import { tallyCredits, formatCsvRow } from "../lib/credits.js";

const past = new Date("2026-01-15T12:00:00Z");
const future = new Date("2099-01-01T00:00:00Z");

function rsvp(memberId, response, event) {
  return { memberId, response, event };
}

describe("tallyCredits", () => {
  it("sums credits across yes-RSVPs", () => {
    const totals = tallyCredits([
      rsvp("m1", "yes", { startsAt: past, serviceHours: 4, campingNights: null, hikingMiles: null }),
      rsvp("m1", "yes", { startsAt: past, serviceHours: null, campingNights: 2, hikingMiles: 5 }),
      rsvp("m2", "yes", { startsAt: past, serviceHours: 1, campingNights: null, hikingMiles: null }),
    ]);
    expect(totals.get("m1")).toEqual({
      serviceHours: 4,
      campingNights: 2,
      hikingMiles: 5,
      eventCount: 2,
    });
    expect(totals.get("m2").serviceHours).toBe(1);
    expect(totals.get("m2").eventCount).toBe(1);
  });

  it("ignores no/maybe responses", () => {
    const totals = tallyCredits([
      rsvp("m1", "no", { startsAt: past, serviceHours: 4 }),
      rsvp("m1", "maybe", { startsAt: past, serviceHours: 4 }),
    ]);
    expect(totals.size).toBe(0);
  });

  it("ignores future events", () => {
    const totals = tallyCredits([
      rsvp("m1", "yes", { startsAt: future, serviceHours: 4 }),
    ]);
    expect(totals.size).toBe(0);
  });

  it("treats null/undefined credit fields as zero", () => {
    const totals = tallyCredits([
      rsvp("m1", "yes", { startsAt: past }),
    ]);
    expect(totals.get("m1")).toEqual({
      serviceHours: 0,
      campingNights: 0,
      hikingMiles: 0,
      eventCount: 1,
    });
  });

  it("skips rsvps without a memberId (anonymous)", () => {
    const totals = tallyCredits([
      rsvp(null, "yes", { startsAt: past, serviceHours: 4 }),
    ]);
    expect(totals.size).toBe(0);
  });
});

describe("formatCsvRow", () => {
  it("joins values with commas", () => {
    expect(formatCsvRow(["a", "b", 3])).toBe("a,b,3");
  });

  it("escapes embedded quotes and commas", () => {
    expect(formatCsvRow(['has "quote"', "comma,inside"])).toBe(
      `"has ""quote""","comma,inside"`,
    );
  });

  it("renders null and undefined as empty cells", () => {
    expect(formatCsvRow([null, undefined, 0])).toBe(",,0");
  });
});
