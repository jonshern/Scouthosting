import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { canSignSlip } from "./index";
import { signedAmongNeeded } from "./status";

const ORG = "o1";
const start = new Date("2026-11-14T09:00:00Z");
const end = new Date("2026-11-15T15:00:00Z");
const before = new Date("2026-11-10T12:00:00Z");
const during = new Date("2026-11-14T12:00:00Z");
const after = new Date("2026-11-16T12:00:00Z");

const base = {
  now: before,
  event: { orgId: ORG, startsAt: start, endsAt: end },
  member: { orgId: ORG, isYouth: true, deletedAt: null, parentIds: ["p1"] },
  parentEmails: ["Mom@Example.invalid"],
  claimedParentEmail: "mom@example.invalid",
  alreadySigned: false,
};

describe("canSignSlip", () => {
  it("allows a linked parent to sign before the event", () => {
    expect(canSignSlip(base)).toEqual({ ok: true });
  });

  it("allows re-signing before the event starts", () => {
    expect(canSignSlip({ ...base, alreadySigned: true }).ok).toBe(true);
  });

  it("allows a first signature during the event", () => {
    expect(canSignSlip({ ...base, now: during }).ok).toBe(true);
  });

  it("locks an existing signature once the event has started", () => {
    expect(canSignSlip({ ...base, now: during, alreadySigned: true })).toMatchObject({
      ok: false,
      reason: "locked",
    });
  });

  it("refuses after the event ends", () => {
    expect(canSignSlip({ ...base, now: after })).toMatchObject({ ok: false, reason: "ended" });
  });

  it("uses startsAt as the end when endsAt is missing", () => {
    const r = canSignSlip({
      ...base,
      now: during,
      event: { orgId: ORG, startsAt: start, endsAt: null },
    });
    expect(r).toMatchObject({ ok: false, reason: "ended" });
  });

  it("refuses a parent who has been unlinked since the email went out", () => {
    expect(canSignSlip({ ...base, parentEmails: ["dad@example.invalid"] })).toMatchObject({
      ok: false,
      reason: "parent",
    });
  });

  it("refuses when the scout was removed or moved orgs", () => {
    expect(canSignSlip({ ...base, member: null })).toMatchObject({ reason: "member" });
    expect(
      canSignSlip({ ...base, member: { ...base.member, deletedAt: new Date() } }),
    ).toMatchObject({ reason: "member" });
    expect(canSignSlip({ ...base, member: { ...base.member, orgId: "o2" } })).toMatchObject({
      reason: "member",
    });
    expect(canSignSlip({ ...base, member: { ...base.member, isYouth: false } })).toMatchObject({
      reason: "member",
    });
  });
});

describe("signedAmongNeeded", () => {
  it("ignores slips for scouts who are no longer going", () => {
    expect(signedAmongNeeded(new Set(["b"]), new Set(["a"]))).toBe(0);
    expect(signedAmongNeeded(new Set(["a", "b"]), new Set(["a", "c"]))).toBe(1);
  });
});
