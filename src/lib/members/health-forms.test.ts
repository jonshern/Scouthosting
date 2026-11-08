import { describe, expect, it } from "vitest";
import { eventNeedsExam, healthFormExpires, healthState, parseHealthDate, readinessFor } from "./health-forms";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("healthFormExpires", () => {
  it("runs through the end of the same month next year", () => {
    expect(healthFormExpires(d("2026-03-09")).toISOString()).toBe("2027-03-31T23:59:59.999Z");
    expect(healthFormExpires(d("2026-12-01")).toISOString()).toBe("2027-12-31T23:59:59.999Z");
    expect(healthFormExpires(d("2024-02-29")).toISOString()).toBe("2025-02-28T23:59:59.999Z");
  });
});

describe("healthState", () => {
  const now = d("2026-11-08");
  it("is missing with no date", () => expect(healthState(null, now)).toBe("missing"));
  it("is current well inside the year", () => expect(healthState(d("2026-06-01"), now)).toBe("current"));
  it("is expiring within 45 days", () => expect(healthState(d("2025-11-20"), now)).toBe("expiring"));
  it("is expired after the end of the 12th month", () => expect(healthState(d("2025-10-31"), now)).toBe("expired"));
});

describe("readinessFor", () => {
  const weekend = { startsAt: d("2026-12-04"), endsAt: d("2026-12-06") };
  const camp = { startsAt: d("2027-06-20"), endsAt: d("2027-06-26") };
  it("needs part C only over 72 hours", () => {
    expect(eventNeedsExam(weekend)).toBe(false);
    expect(eventNeedsExam(camp)).toBe(true);
    expect(eventNeedsExam({ startsAt: d("2026-12-04"), endsAt: null })).toBe(false);
  });
  it("is fine with a current A and B for a weekend", () => {
    expect(readinessFor({ healthFormOn: d("2026-09-01"), healthExamOn: null }, weekend)).toEqual({ ok: true, problem: null });
  });
  it("flags no form", () => {
    expect(readinessFor({ healthFormOn: null, healthExamOn: null }, weekend).problem).toBe("No health form on file");
  });
  it("flags a form that runs out before the trip ends", () => {
    expect(readinessFor({ healthFormOn: d("2025-12-01"), healthExamOn: null }, { startsAt: d("2026-12-30"), endsAt: d("2027-01-02") }, d("2026-11-08")).problem).toBe(
      "Health form runs out Dec 2026, before this event ends",
    );
    expect(readinessFor({ healthFormOn: d("2025-01-10"), healthExamOn: null }, weekend, d("2026-11-08")).problem).toBe("Health form expired Jan 2026");
  });
  it("asks for the exam on long trips", () => {
    expect(readinessFor({ healthFormOn: d("2027-01-10"), healthExamOn: null }, camp).problem).toMatch(/doctor's exam/i);
    expect(readinessFor({ healthFormOn: d("2027-01-10"), healthExamOn: d("2026-05-01") }, camp, d("2026-11-08")).problem).toBe("Doctor's exam runs out May 2027, before this event ends");
    expect(readinessFor({ healthFormOn: d("2027-01-10"), healthExamOn: d("2027-01-10") }, camp).ok).toBe(true);
  });
});

describe("parseHealthDate", () => {
  const now = d("2026-11-08");
  it("reads a date input", () => expect(parseHealthDate("2026-03-09", now)).toEqual(d("2026-03-09")));
  it("treats blank as cleared", () => expect(parseHealthDate("", now)).toBeNull());
  it("refuses the future and nonsense", () => {
    expect(parseHealthDate("2027-01-01", now)).toBe("invalid");
    expect(parseHealthDate("2026-02-30", now)).toBe("invalid");
    expect(parseHealthDate("03/09/2026", now)).toBe("invalid");
    expect(parseHealthDate("1990-01-01", now)).toBe("invalid");
  });
});
