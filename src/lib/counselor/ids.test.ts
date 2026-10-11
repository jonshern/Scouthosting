import { describe, expect, it } from "vitest";
import {
  AssignmentBody,
  AssignmentDeleteQuery,
  CounselorBadgesBody,
  MeetingBody,
  ProgressPutBody,
  REQUIREMENT_ID_PATTERN,
  canReadRequirement,
  lastInitial,
  parseRequirementId,
  relatesAtAll,
  writeRefusal,
  type ScoutRelation,
} from "./ids";

describe("REQUIREMENT_ID_PATTERN", () => {
  it.each([
    "badge:plumbing#6b",
    "badge:first-aid#1",
    "badge:citizenship-in-the-community#8a.2",
    "rank:first-class#4a",
    "rank:tenderfoot#10-12",
    "award:arrow-of-light#1",
    "badge:a1#0A.b",
  ])("accepts %s", (id) => expect(REQUIREMENT_ID_PATTERN.test(id)).toBe(true));

  it.each([
    "",
    "badge:plumbing",
    "badge:plumbing#",
    "badge:plumbing#b6",
    "badge:Plumbing#6",
    "badge:plumb_ing#6",
    "badge:-plumbing#6",
    "badge:plumbing-#6",
    "badge:plumb--ing#6",
    "patch:plumbing#6",
    "badge:plumbing#6-",
    "badge:plumbing#6--a",
    "badge:plumbing#6 b",
    " badge:plumbing#6",
    "badge:plumbing#6\n",
  ])("rejects %j", (id) => expect(REQUIREMENT_ID_PATTERN.test(id)).toBe(false));

  it("parses kind, slug and number", () => {
    expect(parseRequirementId("badge:first-aid#6b")).toEqual({ kind: "badge", slug: "first-aid", number: "6b" });
    expect(parseRequirementId("nope")).toBeNull();
  });
});

describe("permissions", () => {
  const rel = (p: Partial<ScoutRelation>): ScoutRelation => ({
    leader: false,
    family: false,
    badges: new Set(),
    ...p,
  });
  const counselor = rel({ badges: new Set(["plumbing"]) });
  const family = rel({ family: true });
  const leader = rel({ leader: true });
  const stranger = rel({});

  it("only related callers relate at all", () => {
    expect(relatesAtAll(stranger)).toBe(false);
    expect([counselor, family, leader].every(relatesAtAll)).toBe(true);
  });

  it("counselors read only their own badges", () => {
    expect(canReadRequirement(counselor, "badge:plumbing#6b")).toBe(true);
    expect(canReadRequirement(counselor, "badge:cooking#1")).toBe(false);
    expect(canReadRequirement(counselor, "rank:first-class#1")).toBe(false);
    expect(canReadRequirement(family, "badge:cooking#1")).toBe(true);
    expect(canReadRequirement(leader, "rank:first-class#1")).toBe(true);
  });

  it("only leaders and the assigned counselor sign off", () => {
    expect(writeRefusal(leader, "rank:first-class#1", null, "signed_off")).toBeNull();
    expect(writeRefusal(counselor, "badge:plumbing#6b", "done", "signed_off")).toBeNull();
    expect(writeRefusal(counselor, "badge:cooking#1", "done", "signed_off")).toBe("sign_off_not_allowed");
    expect(writeRefusal(family, "badge:plumbing#6b", "done", "signed_off")).toBe("sign_off_not_allowed");
    expect(writeRefusal(stranger, "badge:plumbing#6b", null, "signed_off")).toBe("sign_off_not_allowed");
  });

  it("undoing a sign-off needs the same authority", () => {
    expect(writeRefusal(family, "badge:plumbing#6b", "signed_off", "done")).toBe("sign_off_not_allowed");
    expect(writeRefusal(counselor, "badge:plumbing#6b", "signed_off", "in_progress")).toBeNull();
  });

  it("family tracks progress; counselors only on their badges", () => {
    expect(writeRefusal(family, "rank:tenderfoot#1", null, "done")).toBeNull();
    expect(writeRefusal(counselor, "badge:cooking#1", null, "in_progress")).toBe("not_assigned");
    expect(writeRefusal(stranger, "badge:cooking#1", null, "in_progress")).toBe("not_assigned");
  });
});

describe("lastInitial", () => {
  it("returns one upper-case letter", () => {
    expect(lastInitial("smith")).toBe("S");
    expect(lastInitial("  O'Neil")).toBe("O");
    expect(lastInitial("")).toBe("");
  });
});

describe("body schemas", () => {
  it("progress PUT validates ids, statuses and duplicates", () => {
    expect(ProgressPutBody.safeParse({ items: [{ requirementId: "badge:plumbing#6b", status: "done" }] }).success).toBe(true);
    const bad = (body: unknown) => ProgressPutBody.safeParse(body).error?.issues[0]?.message;
    expect(bad({ items: [{ requirementId: "plumbing 6b", status: "done" }] })).toBe("invalid_requirement_id");
    expect(bad({ items: [{ requirementId: "badge:plumbing#6b", status: "approved" }] })).toBe("invalid_status");
    expect(bad({ items: [] })).toBe("no_items");
    expect(
      bad({
        items: [
          { requirementId: "badge:plumbing#6b", status: "done" },
          { requirementId: "badge:plumbing#6b", status: "in_progress" },
        ],
      }),
    ).toBe("duplicate_requirement");
  });

  it("counselor badges are slugs, deduped and sorted", () => {
    expect(CounselorBadgesBody.parse({ badges: ["plumbing", "cooking", "plumbing"] })).toEqual({
      badges: ["cooking", "plumbing"],
    });
    expect(CounselorBadgesBody.safeParse({ badges: ["Plumbing"] }).error?.issues[0]?.message).toBe("invalid_badge_slug");
  });

  it("assignment bodies and delete queries", () => {
    expect(AssignmentBody.safeParse({ counselorUserId: "u1", scoutId: "m1", badgeSlug: "plumbing" }).success).toBe(true);
    expect(AssignmentBody.safeParse({ counselorUserId: "u1", scoutId: "m1", badgeSlug: "First Aid" }).success).toBe(false);
    expect(AssignmentDeleteQuery.safeParse({ id: "a1" }).success).toBe(true);
    expect(AssignmentDeleteQuery.safeParse({ scoutId: "m1" }).success).toBe(false);
  });

  it("meetings need scouts, a place and a sane time range", () => {
    const base = { org: "troop1", badgeSlug: "plumbing", scoutIds: ["m1", "m1"], startsAt: "2026-11-01T18:00:00Z", place: "Library" };
    const ok = MeetingBody.parse(base);
    expect(ok.scoutIds).toEqual(["m1"]);
    expect(ok.notifyAdultUserIds).toEqual([]);
    const msg = (b: unknown) => MeetingBody.safeParse(b).error?.issues[0]?.message;
    expect(msg({ ...base, scoutIds: [] })).toBe("no_scouts");
    expect(msg({ ...base, place: " " })).toBe("missing_place");
    expect(msg({ ...base, startsAt: "soon" })).toBe("invalid_date");
    expect(msg({ ...base, endsAt: "2026-11-01T17:00:00Z" })).toBe("invalid_range");
  });
});
