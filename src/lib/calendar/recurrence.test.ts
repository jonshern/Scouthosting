import { describe, expect, it } from "vitest";
import { expandOccurrences } from "./recurrence";

describe("expandOccurrences", () => {
  it("returns the single startsAt for a non-recurring event in window", () => {
    const at = new Date("2026-06-01T18:00:00Z");
    const occ = expandOccurrences(
      { startsAt: at },
      new Date("2026-06-01T00:00:00Z"),
      new Date("2026-06-02T00:00:00Z")
    );
    expect(occ).toHaveLength(1);
    expect(occ[0].toISOString()).toBe(at.toISOString());
  });

  it("returns nothing for a non-recurring event outside the window", () => {
    const at = new Date("2026-06-01T18:00:00Z");
    const occ = expandOccurrences(
      { startsAt: at },
      new Date("2026-07-01T00:00:00Z"),
      new Date("2026-08-01T00:00:00Z")
    );
    expect(occ).toEqual([]);
  });

  it("expands a weekly RRULE between window bounds", () => {
    const dt = new Date("2026-06-01T18:00:00Z"); // Monday
    const occ = expandOccurrences(
      { startsAt: dt, rrule: "FREQ=WEEKLY;BYDAY=MO" },
      new Date("2026-06-01T00:00:00Z"),
      new Date("2026-07-01T00:00:00Z")
    );
    expect(occ.length).toBe(5); // June 2026 has 5 Mondays: 1, 8, 15, 22, 29
  });

  it("respects recurrenceUntil", () => {
    const dt = new Date("2026-06-01T18:00:00Z");
    const occ = expandOccurrences(
      {
        startsAt: dt,
        rrule: "FREQ=WEEKLY;BYDAY=MO",
        recurrenceUntil: new Date("2026-06-15T00:00:00Z"),
      },
      new Date("2026-06-01T00:00:00Z"),
      new Date("2026-08-01T00:00:00Z")
    );
    expect(occ.length).toBe(2);
  });
});
