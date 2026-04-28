import { describe, it, expect } from "vitest";
import {
  icsFor,
  icsForOrg,
  gcalAddUrl,
  outlookAddUrl,
  mapUrls,
  expandOccurrences,
} from "../lib/calendar.js";

const baseEvent = {
  id: "evt1",
  title: "PLC Meeting",
  description: "Patrol Leaders' Council",
  startsAt: new Date("2026-05-04T18:30:00Z"),
  endsAt: new Date("2026-05-04T19:30:00Z"),
  allDay: false,
  location: "Holy Nativity",
  locationAddress: "100 Main St, Anytown",
  category: "PLC",
  rrule: null,
  recurrenceUntil: null,
  updatedAt: new Date("2026-04-01T00:00:00Z"),
  createdAt: new Date("2026-04-01T00:00:00Z"),
};

describe("icsFor", () => {
  it("emits a valid VCALENDAR with one VEVENT and CRLF line endings", () => {
    const out = icsFor(baseEvent, { orgSlug: "troop100" });
    expect(out).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(out).toMatch(/END:VCALENDAR\r\n$/);
    expect(out).toContain("BEGIN:VEVENT");
    expect(out).toContain("END:VEVENT");
    expect(out).toContain("UID:evt1@troop100.scouthosting.com");
    expect(out).toContain("DTSTART:20260504T183000Z");
    expect(out).toContain("DTEND:20260504T193000Z");
    expect(out).toContain("SUMMARY:PLC Meeting");
    expect(out).toContain("LOCATION:100 Main St\\, Anytown");
    expect(out).toContain("CATEGORIES:PLC");
  });

  it("escapes commas, semicolons, and newlines in text fields", () => {
    const out = icsFor(
      { ...baseEvent, description: "Bring; gear, snacks\nand water" },
      { orgSlug: "x" }
    );
    expect(out).toContain("DESCRIPTION:Bring\\; gear\\, snacks\\nand water");
  });

  it("emits VALUE=DATE for all-day events", () => {
    const out = icsFor(
      { ...baseEvent, allDay: true, startsAt: new Date("2026-05-04T00:00:00Z"), endsAt: new Date("2026-05-05T00:00:00Z") },
      { orgSlug: "x" }
    );
    expect(out).toContain("DTSTART;VALUE=DATE:20260504");
    expect(out).toContain("DTEND;VALUE=DATE:20260505");
  });

  it("includes RRULE when set", () => {
    const out = icsFor({ ...baseEvent, rrule: "FREQ=WEEKLY" }, { orgSlug: "x" });
    expect(out).toContain("RRULE:FREQ=WEEKLY");
  });

  it("rewrites UNTIL inside RRULE when recurrenceUntil is set", () => {
    const out = icsFor(
      {
        ...baseEvent,
        rrule: "FREQ=WEEKLY;UNTIL=99990101T000000Z",
        recurrenceUntil: new Date("2026-12-31T00:00:00Z"),
      },
      { orgSlug: "x" }
    );
    expect(out).toMatch(/RRULE:FREQ=WEEKLY;UNTIL=20261231T000000Z/);
    expect(out).not.toContain("UNTIL=99990101T000000Z");
  });
});

describe("icsForOrg", () => {
  it("emits a VEVENT per event with X-WR-CALNAME", () => {
    const out = icsForOrg([baseEvent, { ...baseEvent, id: "evt2", title: "Camporee" }], {
      orgSlug: "troop100",
      displayName: "Sample Troop 100",
    });
    expect(out.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(out).toContain("X-WR-CALNAME:Sample Troop 100");
  });
});

describe("gcalAddUrl", () => {
  it("builds a render?action=TEMPLATE URL with title, dates, and location", () => {
    const url = gcalAddUrl(baseEvent);
    expect(url).toContain("https://calendar.google.com/calendar/render?");
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("text=PLC+Meeting");
    expect(url).toContain("dates=20260504T183000Z%2F20260504T193000Z");
    expect(url).toContain("location=100+Main+St%2C+Anytown");
  });

  it("defaults to a 1-hour window when no end time is set", () => {
    const url = gcalAddUrl({ ...baseEvent, endsAt: null });
    // 18:30 → 19:30 (one hour later)
    expect(url).toContain("dates=20260504T183000Z%2F20260504T193000Z");
  });

  it("uses VALUE=DATE-style range for all-day events", () => {
    const url = gcalAddUrl({
      ...baseEvent,
      allDay: true,
      startsAt: new Date("2026-05-04T00:00:00Z"),
      endsAt: new Date("2026-05-05T00:00:00Z"),
    });
    expect(url).toContain("dates=20260504%2F20260505");
  });
});

describe("outlookAddUrl", () => {
  it("builds an Outlook compose deep-link", () => {
    const url = outlookAddUrl(baseEvent);
    expect(url).toContain("https://outlook.live.com/calendar/0/deeplink/compose?");
    expect(url).toContain("subject=PLC+Meeting");
    expect(url).toContain("startdt=2026-05-04T18%3A30%3A00.000Z");
  });
});

describe("mapUrls", () => {
  it("returns Google / Apple / Waze URLs", () => {
    const urls = mapUrls("100 Main St, Anytown");
    expect(urls.google).toBe("https://www.google.com/maps/dir/?api=1&destination=100%20Main%20St%2C%20Anytown");
    expect(urls.apple).toBe("https://maps.apple.com/?daddr=100%20Main%20St%2C%20Anytown");
    expect(urls.waze).toBe("https://waze.com/ul?q=100%20Main%20St%2C%20Anytown&navigate=yes");
  });
  it("returns null for empty input", () => {
    expect(mapUrls("")).toBeNull();
    expect(mapUrls(null)).toBeNull();
  });
});

describe("expandOccurrences", () => {
  it("returns the single event when there's no rrule", async () => {
    const out = await expandOccurrences(baseEvent, {
      from: new Date("2026-04-01"),
      to: new Date("2026-06-01"),
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(baseEvent);
  });

  it("expands a weekly rule into the right number of occurrences", async () => {
    const out = await expandOccurrences(
      { ...baseEvent, rrule: "FREQ=WEEKLY" },
      {
        from: new Date("2026-05-01T00:00:00Z"),
        to: new Date("2026-06-01T00:00:00Z"),
        max: 10,
      }
    );
    // 2026-05-04, 11, 18, 25 = 4 occurrences in May
    expect(out).toHaveLength(4);
    expect(out[0].startsAt.toISOString()).toBe("2026-05-04T18:30:00.000Z");
    expect(out[1].startsAt.toISOString()).toBe("2026-05-11T18:30:00.000Z");
  });

  it("preserves event duration on each occurrence", async () => {
    const out = await expandOccurrences(
      { ...baseEvent, rrule: "FREQ=WEEKLY" },
      { from: new Date("2026-05-01"), to: new Date("2026-05-15"), max: 3 }
    );
    for (const occ of out) {
      expect(occ.endsAt.getTime() - occ.startsAt.getTime()).toBe(60 * 60 * 1000);
    }
  });

  it("respects recurrenceUntil", async () => {
    const out = await expandOccurrences(
      {
        ...baseEvent,
        rrule: "FREQ=WEEKLY",
        recurrenceUntil: new Date("2026-05-15T00:00:00Z"),
      },
      { from: new Date("2026-05-01"), to: new Date("2026-08-01"), max: 50 }
    );
    expect(out.length).toBeLessThanOrEqual(2); // 5/4 and 5/11
    expect(out.every((o) => o.startsAt < new Date("2026-05-15"))).toBe(true);
  });

  it("returns [event] for a malformed RRULE rather than throwing", async () => {
    const out = await expandOccurrences(
      { ...baseEvent, rrule: "NOT_A_VALID_RULE" },
      { from: new Date("2026-05-01"), to: new Date("2026-05-15") }
    );
    expect(Array.isArray(out)).toBe(true);
    expect(out).toHaveLength(1);
  });
});
