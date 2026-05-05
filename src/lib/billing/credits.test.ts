import { describe, expect, it } from "vitest";
import { formatCsvRow, tallyCredits } from "./credits";

describe("billing/credits", () => {
  const past = new Date("2026-01-01T00:00:00Z");
  const future = new Date("2030-01-01T00:00:00Z");

  it("aggregates yes-RSVPs only", () => {
    const out = tallyCredits([
      { memberId: "m1", response: "yes", event: { startsAt: past, serviceHours: 2 } },
      { memberId: "m1", response: "no", event: { startsAt: past, serviceHours: 5 } },
      { memberId: "m1", response: "maybe", event: { startsAt: past, serviceHours: 5 } },
    ]);
    expect(out.get("m1")?.serviceHours).toBe(2);
    expect(out.get("m1")?.eventCount).toBe(1);
  });

  it("ignores events past asOf", () => {
    const out = tallyCredits(
      [{ memberId: "m1", response: "yes", event: { startsAt: future, serviceHours: 99 } }],
      { asOf: new Date() },
    );
    expect(out.size).toBe(0);
  });

  it("sums camping nights + hiking miles per member", () => {
    const out = tallyCredits([
      {
        memberId: "m1",
        response: "yes",
        event: { startsAt: past, campingNights: 2, hikingMiles: 5 },
      },
      {
        memberId: "m1",
        response: "yes",
        event: { startsAt: past, campingNights: 1, hikingMiles: 3 },
      },
    ]);
    expect(out.get("m1")?.campingNights).toBe(3);
    expect(out.get("m1")?.hikingMiles).toBe(8);
    expect(out.get("m1")?.eventCount).toBe(2);
  });
});

describe("billing/credits/formatCsvRow", () => {
  it("quotes values with commas, quotes, or newlines", () => {
    expect(formatCsvRow(["plain", "with,comma", 'with"quote', "with\nnewline"])).toBe(
      'plain,"with,comma","with""quote","with\nnewline"',
    );
  });

  it("renders null/undefined as empty", () => {
    expect(formatCsvRow([null, undefined, ""])).toBe(",,");
  });
});
