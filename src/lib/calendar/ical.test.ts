import { describe, expect, it } from "vitest";
import { buildIcal, fold, googleCalendarAddUrl } from "./ical";

describe("fold", () => {
  it("returns short lines unchanged", () => {
    expect(fold("BEGIN:VCALENDAR")).toBe("BEGIN:VCALENDAR");
  });
  it("folds at 75 octets with CRLF + space", () => {
    const long = "X".repeat(150);
    const folded = fold(long);
    expect(folded.split("\r\n").length).toBeGreaterThan(1);
    expect(folded.split("\r\n").slice(1).every((l) => l.startsWith(" "))).toBe(true);
  });
});

describe("buildIcal", () => {
  it("emits a minimal valid VCALENDAR + VEVENT", () => {
    const out = buildIcal({
      calName: "Troop 100",
      uidHost: "compass.app",
      events: [
        {
          id: "evt1",
          title: "Pack meeting",
          startsAt: new Date("2026-06-01T23:00:00Z"),
          endsAt: new Date("2026-06-02T00:00:00Z"),
        },
      ],
    });
    expect(out).toContain("BEGIN:VCALENDAR");
    expect(out).toContain("VERSION:2.0");
    expect(out).toContain("UID:evt1@compass.app");
    expect(out).toContain("SUMMARY:Pack meeting");
    expect(out).toContain("DTSTART:20260601T230000Z");
    expect(out).toContain("DTEND:20260602T000000Z");
    expect(out).toContain("END:VEVENT");
    expect(out).toContain("END:VCALENDAR");
  });

  it("escapes commas, semicolons, and newlines in text fields", () => {
    const out = buildIcal({
      calName: "T100",
      uidHost: "compass.app",
      events: [
        {
          id: "evt1",
          title: "Meeting; bring snacks",
          description: "Line 1\nLine 2",
          location: "Hall, Anytown",
          startsAt: new Date("2026-06-01T23:00:00Z"),
        },
      ],
    });
    expect(out).toContain("SUMMARY:Meeting\\; bring snacks");
    expect(out).toContain("DESCRIPTION:Line 1\\nLine 2");
    expect(out).toContain("LOCATION:Hall\\, Anytown");
  });

  it("emits all-day events as DATE values", () => {
    const out = buildIcal({
      calName: "T100",
      uidHost: "compass.app",
      events: [
        {
          id: "campout",
          title: "Campout",
          allDay: true,
          startsAt: new Date("2026-08-15T00:00:00Z"),
          endsAt: new Date("2026-08-17T00:00:00Z"),
        },
      ],
    });
    expect(out).toContain("DTSTART;VALUE=DATE:20260815");
    expect(out).toContain("DTEND;VALUE=DATE:20260817");
  });

  it("emits an RRULE with optional UNTIL", () => {
    const out = buildIcal({
      calName: "T100",
      uidHost: "compass.app",
      events: [
        {
          id: "weekly",
          title: "Weekly meeting",
          startsAt: new Date("2026-06-01T23:00:00Z"),
          rrule: "FREQ=WEEKLY;BYDAY=MO",
          recurrenceUntil: new Date("2026-12-31T05:00:00Z"),
        },
      ],
    });
    expect(out).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T050000Z");
  });
});

describe("googleCalendarAddUrl", () => {
  it("includes title, dates, and location", () => {
    const url = googleCalendarAddUrl({
      id: "x",
      title: "Pack meeting",
      startsAt: new Date("2026-06-01T23:00:00Z"),
      endsAt: new Date("2026-06-02T00:00:00Z"),
      location: "Hall",
    });
    expect(url).toContain("calendar.google.com");
    expect(url).toContain("text=Pack+meeting");
    expect(url).toContain("dates=20260601T230000Z%2F20260602T000000Z");
    expect(url).toContain("location=Hall");
  });
});
