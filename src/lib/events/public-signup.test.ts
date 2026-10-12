// Input rules for public event sign-ups and the Waypoint event-file
// import. The database paths are in public-signup.db.test.ts.

import { describe, expect, it } from "vitest";
import {
  ExternalIdSchema,
  PublicSlugSchema,
  ScoutNameSchema,
  SignupBodySchema,
  submitPublicSignup,
} from "./public-signup";
import { publicSlugForEventFile, slotsFromEventFile } from "./waypoint-file";

const body = (over: Record<string, unknown> = {}) => ({
  eventSlug: "spring-badge-day",
  guardian: { name: "Pat Parent", email: "Pat@Example.com", phone: "612-555-0100" },
  scoutName: "Alex P.",
  unit: "Troop 100",
  stationIds: ["first-aid-am"],
  volunteerRoles: [],
  ...over,
});

describe("ScoutNameSchema (first name + last initial only)", () => {
  it.each(["Alex P.", "Alex P", "  Alex   P. ", "Mary-Kate O.", "D'Andre J.", "José Á."])("accepts %j", (n) => {
    expect(ScoutNameSchema.safeParse(n).success).toBe(true);
  });

  it("collapses whitespace but keeps what was typed", () => {
    expect(ScoutNameSchema.parse("  Alex   P. ")).toBe("Alex P.");
  });

  it.each([
    "",
    "Alex",
    "Alex Parker",
    "Alex P. Jr",
    "Alex Pa.",
    "A1ex P.",
    "Alex P.!",
    "<b>Al</b> P.",
    `${"A".repeat(31)} P.`,
  ])("rejects %j", (n) => {
    expect(ScoutNameSchema.safeParse(n).success).toBe(false);
  });
});

describe("ExternalIdSchema (opaque station / role ids)", () => {
  it.each(["first-aid-am", "first_aid#4b", "FA.1", "station:2"])("accepts %j", (id) => {
    expect(ExternalIdSchema.safeParse(id).success).toBe(true);
  });
  it.each(["", "-lead", "a b", "a/b", "a?b", "x".repeat(81)])("rejects %j", (id) => {
    expect(ExternalIdSchema.safeParse(id).success).toBe(false);
  });
});

describe("PublicSlugSchema", () => {
  it("lowercases and trims", () => {
    expect(PublicSlugSchema.parse(" Spring-Badge-Day ")).toBe("spring-badge-day");
  });
  it.each(["ab", "a--b", "-ab", "ab-", "a_b", "a b", "a".repeat(81)])("rejects %j", (s) => {
    expect(PublicSlugSchema.safeParse(s).success).toBe(false);
  });
});

describe("SignupBodySchema", () => {
  it("parses the Waypoint request and normalizes the email", () => {
    const r = SignupBodySchema.parse(body());
    expect(r.guardian.email).toBe("pat@example.com");
    expect(r.stationIds).toEqual(["first-aid-am"]);
    expect(r.volunteerRoles).toEqual([]);
  });

  it("dedupes ids and drops empty optional fields", () => {
    const r = SignupBodySchema.parse(
      body({ stationIds: ["a", "a", "b"], unit: "", guardian: { name: "P", email: "p@x.org", phone: "" } }),
    );
    expect(r.stationIds).toEqual(["a", "b"]);
    expect(r.unit).toBeUndefined();
    expect(r.guardian.phone).toBeUndefined();
  });

  it("needs at least one station or role", () => {
    const r = SignupBodySchema.safeParse(body({ stationIds: [], volunteerRoles: [] }));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/at least one/);
  });

  it.each([
    ["missing guardian", { guardian: undefined }],
    ["bad email", { guardian: { name: "P", email: "nope" } }],
    ["bad phone", { guardian: { name: "P", email: "p@x.org", phone: "call me" } }],
    ["full surname", { scoutName: "Alex Parker" }],
    ["too many stations", { stationIds: Array.from({ length: 21 }, (_, i) => `s${i}`) }],
    ["bad station id", { stationIds: ["../etc"] }],
    ["non-array roles", { volunteerRoles: "grill" }],
    ["long unit", { unit: "x".repeat(61) }],
  ])("rejects %s", (_label, over) => {
    expect(SignupBodySchema.safeParse(body(over)).success).toBe(false);
  });
});

describe("submitPublicSignup guards before any query", () => {
  it("refuses a body whose eventSlug differs from the address", async () => {
    const db = {} as never;
    await expect(
      submitPublicSignup(db, "other-day", SignupBodySchema.parse(body())),
    ).rejects.toMatchObject({ status: 400, code: "slug_mismatch" });
  });
});

describe("slotsFromEventFile", () => {
  const file = {
    file: "spring.json",
    title: "Spring",
    blocks: [{ id: "am", label: "Morning", start: "9:00", end: "12:00" }],
    stations: [
      { id: "fa-am", badge: "First Aid", block: "am", capacity: 12, reqIds: ["first-aid#1"] },
      { id: "chem", badge: "Chemistry", block: "pm", capacity: 8, reqIds: [] },
    ],
    volunteerRoles: [{ id: "grill", label: "Grill", need: 3, desc: "Lunch" }],
  };

  it("makes keyed slots for stations and roles", () => {
    const r = slotsFromEventFile(JSON.stringify(file));
    expect("slots" in r && r.slots).toEqual([
      { key: "station:fa-am", title: "First Aid (Morning)", description: null, capacity: 12, sortOrder: 0 },
      { key: "station:chem", title: "Chemistry (pm)", description: null, capacity: 8, sortOrder: 1 },
      { key: "role:grill", title: "Volunteer: Grill", description: "Lunch", capacity: 3, sortOrder: 2 },
    ]);
  });

  it("explains bad input", () => {
    expect(slotsFromEventFile("{")).toEqual({ error: "That isn't valid JSON." });
    expect(slotsFromEventFile(JSON.stringify({ stations: [] }))).toHaveProperty("error");
    expect(
      slotsFromEventFile(JSON.stringify({ ...file, stations: [file.stations[0], file.stations[0]] })),
    ).toEqual({ error: 'Station id "fa-am" appears twice.' });
    expect(
      slotsFromEventFile(JSON.stringify({ stations: [{ id: "x", badge: "B", capacity: 0 }] })),
    ).toHaveProperty("error");
  });
});

describe("publicSlugForEventFile", () => {
  it("uses the file's name without .json, as Waypoint does", () => {
    expect(publicSlugForEventFile("2026-11-14-scout-tech-fair.json")).toBe("2026-11-14-scout-tech-fair");
    expect(publicSlugForEventFile("C:\\events\\2026-11-14-scout-tech-fair.JSON")).toBe("2026-11-14-scout-tech-fair");
  });

  it("falls back to the date and title the name is built from", () => {
    expect(publicSlugForEventFile("", "2026-11-14", "Scout Tech Fair")).toBe("2026-11-14-scout-tech-fair");
    expect(publicSlugForEventFile("my file (1).json", "2026-11-14", "Scout Tech Fair!")).toBe(
      "2026-11-14-scout-tech-fair",
    );
  });

  it("returns null when nothing gives a usable slug", () => {
    expect(publicSlugForEventFile(undefined)).toBeNull();
    expect(publicSlugForEventFile("a.json", "2026", undefined)).toBeNull();
  });

  it("comes back with the parsed file", () => {
    const text = JSON.stringify({
      date: "2026-11-14",
      title: "Scout Tech Fair",
      stations: [{ id: "fa", badge: "First Aid", capacity: 4 }],
    });
    expect(slotsFromEventFile(text)).toMatchObject({ publicSlug: "2026-11-14-scout-tech-fair" });
    expect(slotsFromEventFile(text, "spring-day.json")).toMatchObject({ publicSlug: "spring-day" });
  });
});
