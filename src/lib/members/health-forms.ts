// Annual health form dates (BSA Annual Health and Medical Record).
//
// Compass keeps two dates per person and nothing else: the date on
// parts A and B (needed for every event) and the date of the provider's
// exam, part C (needed for events over 72 hours, summer camp and high
// adventure). No form, no medical details.
//
// A form dated in March is good through the end of March next year
// (a form dated March 9 is valid "through March" of the following year,
// per Scouting America's AHMR FAQ), so expiry is the last day of the
// same month one year on.
//
// The pure helpers below are unit tested; the two loaders read the
// roster and do no authorization: callers are leader-gated pages.

import type { Org } from "@prisma/client";
import { prisma } from "@/lib/db";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";

const DAY = 86_400_000;
/** Events longer than this need part C as well. */
export const EXAM_NEEDED_OVER_MS = 72 * 3_600_000;
/** "Expiring soon" means within this many days. */
export const SOON_DAYS = 45;

export type HealthState = "current" | "expiring" | "expired" | "missing";

/** The last moment a form dated `on` counts (end of the same month next year, UTC). */
export function healthFormExpires(on: Date): Date {
  // Date.UTC(y, m + 1, 1) is the first of the month after; minus 1 ms is the end of month m.
  return new Date(Date.UTC(on.getUTCFullYear() + 1, on.getUTCMonth() + 1, 1) - 1);
}

/** Where one dated form stands on `at`, with "expiring" meaning it lapses within SOON_DAYS. */
export function healthState(on: Date | null | undefined, at: Date = new Date()): HealthState {
  if (!on) return "missing";
  const exp = healthFormExpires(on).getTime();
  if (exp < at.getTime()) return "expired";
  if (exp - at.getTime() <= SOON_DAYS * DAY) return "expiring";
  return "current";
}

/** Does this event need part C (the provider's exam)? */
export function eventNeedsExam(e: { startsAt: Date; endsAt: Date | null }): boolean {
  return !!e.endsAt && e.endsAt.getTime() - e.startsAt.getTime() > EXAM_NEEDED_OVER_MS;
}

export type Readiness = {
  ok: boolean;
  /** What's missing, in words a leader reads on the event page. */
  problem: string | null;
};

/**
 * Is a person covered for an event? The forms have to be good through
 * the event's last day, not just today.
 */
export function readinessFor(
  m: { healthFormOn: Date | null; healthExamOn: Date | null },
  e: { startsAt: Date; endsAt: Date | null },
  now: Date = new Date(),
): Readiness {
  const last = e.endsAt ?? e.startsAt;
  const covers = (on: Date | null) => !!on && on.getTime() <= last.getTime() && healthFormExpires(on).getTime() >= last.getTime();
  const why = (on: Date | null, what: string, none: string) => {
    if (!on) return none;
    const exp = healthFormExpires(on);
    return exp.getTime() < now.getTime() ? `${what} expired ${monthYear(exp)}` : `${what} runs out ${monthYear(exp)}, before this event ends`;
  };
  if (!covers(m.healthFormOn)) {
    return { ok: false, problem: why(m.healthFormOn, "Health form", "No health form on file") };
  }
  if (eventNeedsExam(e) && !covers(m.healthExamOn)) {
    return { ok: false, problem: why(m.healthExamOn, "Doctor's exam", "No doctor's exam on file (over 72 hours)") };
  }
  return { ok: true, problem: null };
}

/** "2026-03-09" (a date input's value) → a UTC midnight Date, or null. Rejects the future and nonsense. */
export function parseHealthDate(v: string | null | undefined, now: Date = new Date()): Date | null | "invalid" {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "invalid";
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return "invalid";
  if (d.getTime() > now.getTime() + DAY) return "invalid";
  if (d.getUTCFullYear() < 2000) return "invalid";
  return d;
}

/** For a date input's defaultValue. */
export const dateInputValue = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

/** "Mar 2027", for "good through". */
export const monthYear = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export type HealthRow = {
  memberId: string;
  name: string;
  isYouth: boolean;
  patrol: string | null;
  formOn: Date | null;
  examOn: Date | null;
  form: HealthState;
  exam: HealthState;
};

/** Everyone active on the roster with their two dates, the ones needing attention first. */
export async function healthFormReport(org: Pick<Org, "id" | "encryptedDek">, at: Date = new Date()): Promise<HealthRow[]> {
  if (!org.encryptedDek) return [];
  const rows = await prisma.member.findMany({
    where: { orgId: org.id, deletedAt: null, status: "active" },
    select: {
      id: true, isYouth: true, patrol: true, healthFormOn: true, healthExamOn: true,
      encFirstName: true, encLastName: true, encPhone: true, encStreet: true, encCity: true, encState: true, encZip: true,
    },
  });
  const dek = unwrapDekWithMaster(org);
  const rank: Record<HealthState, number> = { expired: 0, missing: 1, expiring: 2, current: 3 };
  return rows
    .map((m) => {
      const pii = decryptMemberPii(m, dek, org.id);
      return {
        memberId: m.id,
        name: `${pii.firstName} ${pii.lastName}`.trim(),
        isYouth: m.isYouth,
        patrol: m.patrol,
        formOn: m.healthFormOn,
        examOn: m.healthExamOn,
        form: healthState(m.healthFormOn, at),
        exam: healthState(m.healthExamOn, at),
      };
    })
    .sort((a, b) => rank[a.form] - rank[b.form] || (a.isYouth === b.isYouth ? 0 : a.isYouth ? -1 : 1) || a.name.localeCompare(b.name));
}

export type EventHealthGap = { memberId: string; name: string; isYouth: boolean; problem: string };

/** People with a yes RSVP linked to the roster who aren't covered for this event. */
export async function eventHealthGaps(
  org: Pick<Org, "id" | "encryptedDek">,
  event: { id: string; startsAt: Date; endsAt: Date | null },
): Promise<{ gaps: EventHealthGap[]; checked: number; needsExam: boolean }> {
  const needsExam = eventNeedsExam(event);
  // A finished event needs no warning.
  if (!org.encryptedDek || (event.endsAt ?? event.startsAt).getTime() < Date.now()) return { gaps: [], checked: 0, needsExam };
  const rsvps = await prisma.rsvp.findMany({
    where: { orgId: org.id, eventId: event.id, response: "yes", memberId: { not: null } },
    select: {
      member: {
        select: {
          id: true, orgId: true, deletedAt: true, isYouth: true, healthFormOn: true, healthExamOn: true,
          encFirstName: true, encLastName: true, encPhone: true, encStreet: true, encCity: true, encState: true, encZip: true,
        },
      },
    },
  });
  const members = new Map<string, NonNullable<(typeof rsvps)[number]["member"]>>();
  for (const r of rsvps) if (r.member && r.member.orgId === org.id && !r.member.deletedAt) members.set(r.member.id, r.member);
  const dek = unwrapDekWithMaster(org);
  const gaps: EventHealthGap[] = [];
  for (const m of members.values()) {
    const r = readinessFor(m, event);
    if (r.ok) continue;
    const pii = decryptMemberPii(m, dek, org.id);
    gaps.push({ memberId: m.id, name: `${pii.firstName} ${pii.lastName}`.trim(), isYouth: m.isYouth, problem: r.problem! });
  }
  gaps.sort((a, b) => (a.isYouth === b.isYouth ? a.name.localeCompare(b.name) : a.isYouth ? -1 : 1));
  return { gaps, checked: members.size, needsExam };
}
