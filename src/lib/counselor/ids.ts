// Ids, statuses and the permission rule for counselor routes. Pure:
// no DB, so the unit tests cover every branch.

import { z } from "zod";

// Mirrors @scout-core/catalog REQUIREMENT_ID_PATTERN in
// jonshern/scout-core packages/catalog/src/ids.ts. Keep the two in
// step. (scout-core is private and couldn't be read when this was
// written; this is the documented form of that pattern.)
//   kind ":" slug "#" number, e.g. "badge:plumbing#6b", "rank:first-class#4a".
export const REQUIREMENT_ID_PATTERN =
  /^(badge|rank|award):[a-z0-9]+(?:-[a-z0-9]+)*#[0-9][0-9A-Za-z.]*(?:-[0-9A-Za-z.]+)*$/;

/** The slug part of a requirement id, on its own (e.g. "plumbing"). */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const BadgeSlug = z.string().max(64).regex(SLUG_PATTERN, "invalid_badge_slug");

export const RequirementId = z.string().max(128).regex(REQUIREMENT_ID_PATTERN, "invalid_requirement_id");

export const PROGRESS_STATUSES = ["not_started", "in_progress", "done", "signed_off"] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];
export const ProgressStatusSchema = z.enum(PROGRESS_STATUSES, { message: "invalid_status" });

export type RequirementKind = "badge" | "rank" | "award";

export function parseRequirementId(id: string): { kind: RequirementKind; slug: string; number: string } | null {
  if (!REQUIREMENT_ID_PATTERN.test(id)) return null;
  const colon = id.indexOf(":");
  const hash = id.indexOf("#");
  return {
    kind: id.slice(0, colon) as RequirementKind,
    slug: id.slice(colon + 1, hash),
    number: id.slice(hash + 1),
  };
}

/**
 * How the caller relates to a scout.
 *   leader:  org admin or leader — may read and set anything.
 *   badges:  badge slugs the caller is assigned to counsel this scout on.
 *   family:  the scout themself, or a linked parent.
 */
export type ScoutRelation = { leader: boolean; badges: ReadonlySet<string>; family: boolean };

export function relatesAtAll(r: ScoutRelation): boolean {
  return r.leader || r.family || r.badges.size > 0;
}

/** Can the caller see this requirement? Counselors see only their badges. */
export function canReadRequirement(r: ScoutRelation, requirementId: string): boolean {
  if (r.leader || r.family) return true;
  const p = parseRequirementId(requirementId);
  return !!p && p.kind === "badge" && r.badges.has(p.slug);
}

/**
 * Can the caller move a requirement from `from` to `to`? Returns null
 * when allowed, otherwise the refusal reason.
 *
 * Signing off (and undoing a sign-off) needs sign-off authority: an
 * org admin/leader, or a counselor assigned to this scout for this
 * badge. Rank and award requirements are signed off by leaders only.
 * Family may track not_started / in_progress / done themselves. An
 * assigned counselor may set any status on their badge.
 */
export function writeRefusal(
  r: ScoutRelation,
  requirementId: string,
  from: ProgressStatus | null,
  to: ProgressStatus,
): null | "sign_off_not_allowed" | "not_assigned" {
  if (r.leader) return null;
  const p = parseRequirementId(requirementId);
  if (p && p.kind === "badge" && r.badges.has(p.slug)) return null;
  if (to === "signed_off" || from === "signed_off") return "sign_off_not_allowed";
  if (r.family) return null;
  return "not_assigned";
}

/** "Smith" → "S". Never return more of a scout's last name than this. */
export function lastInitial(lastName: string): string {
  const c = lastName.trim().charAt(0);
  return c ? c.toUpperCase() : "";
}

/** PUT /api/v1/scouts/:id/progress body. */
export const ProgressPutBody = z.object({
  items: z
    .array(
      z.object({
        requirementId: RequirementId,
        status: ProgressStatusSchema,
        note: z.string().trim().max(2000).optional().nullable(),
      }),
    )
    .min(1, "no_items")
    .max(200, "too_many_items")
    .refine((items) => new Set(items.map((i) => i.requirementId)).size === items.length, "duplicate_requirement"),
});

/** PUT /api/v1/me/counselor-badges body: the full list (replaces). */
export const CounselorBadgesBody = z.object({
  badges: z
    .array(BadgeSlug)
    .max(300, "too_many_badges")
    .transform((b) => [...new Set(b)].sort()),
});

/** POST /api/v1/orgs/:slug/counselor-assignments body. */
export const AssignmentBody = z.object({
  counselorUserId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "invalid_counselor"),
  scoutId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "invalid_scout"),
  badgeSlug: BadgeSlug,
});

/** DELETE query: ?id=… or all three of counselorUserId, scoutId, badgeSlug. */
export const AssignmentDeleteQuery = z.union([
  z.object({ id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/) }),
  AssignmentBody,
]);

const Cuid = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "invalid id");
const When = z
  .string()
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), "invalid_date")
  .transform((s) => new Date(s));

/** POST /api/v1/counselor/meetings body. */
export const MeetingBody = z
  .object({
    org: Cuid,
    badgeSlug: BadgeSlug,
    scoutIds: z
      .array(Cuid)
      .min(1, "no_scouts")
      .max(30, "too_many_scouts")
      .transform((ids) => [...new Set(ids)]),
    startsAt: When,
    endsAt: When.optional().nullable(),
    place: z.string().trim().min(1, "missing_place").max(300),
    notes: z.string().trim().max(2000).optional().nullable(),
    // Other adults (org members) to notify besides each scout's parents.
    notifyAdultUserIds: z
      .array(Cuid)
      .max(10)
      .default([])
      .transform((ids) => [...new Set(ids)]),
  })
  .refine((m) => !m.endsAt || m.endsAt > m.startsAt, "invalid_range");
