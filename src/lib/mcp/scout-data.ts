// Database reads behind the connector's tools, one scout at a time.
// Every function takes a scout the caller already got from
// accessibleScouts() (lib/mcp/scouts.ts); nothing here checks access.

import { prisma } from "@/lib/db";
import { orgDecryptor } from "@/lib/counselor/access";
import { itemIndex, itemName, loadCatalog, type CatalogItem } from "./catalog";
import { summarizeJourney, type AwardInput, type JourneySummary, type LanternInput } from "./journey";
import type { AccessibleScout } from "./scouts";

const DAY = 86_400_000;

/** A scout on a unit's roster: the reads that need a troop. */
type TroopScout = AccessibleScout & { memberId: string; orgId: string };
export const inTroop = (s: AccessibleScout): s is TroopScout => !!s.memberId && !!s.orgId;

/** The adult's Lantern trail for this scout, if they keep one. */
async function lanternFor(scout: AccessibleScout): Promise<LanternInput> {
  if (!scout.journeyId) return null;
  const row = await prisma.journeyScout.findUnique({
    where: { id: scout.journeyId },
    select: { path: true, custom: true, progress: { select: { key: true, doneOn: true } } },
  });
  if (!row) return null;
  const path = Array.isArray(row.path) ? row.path.filter((k): k is string => typeof k === "string") : [];
  const custom: Record<string, CatalogItem> = {};
  if (row.custom && typeof row.custom === "object" && !Array.isArray(row.custom)) {
    for (const [k, v] of Object.entries(row.custom as Record<string, unknown>)) {
      const item = v as CatalogItem;
      if (item && typeof item === "object" && Array.isArray(item.reqs)) {
        custom[k] = { ...item, reqs: item.reqs.map((r) => ({ ...r, subs: Array.isArray(r.subs) ? r.subs : [] })) };
      }
    }
  }
  return { path, custom, checks: new Map(row.progress.map((p) => [p.key, p.doneOn])) };
}

async function fullName(scout: TroopScout): Promise<string> {
  const row = await prisma.member.findUnique({ where: { id: scout.memberId }, select: { encFirstName: true, encLastName: true } });
  if (!row) return "";
  const { firstName, lastName } = (await orgDecryptor(scout.orgId))(row);
  return `${firstName} ${lastName}`.trim();
}

/** Court of honor awards presented to this scout (matched by full name, as CohAward stores it). */
async function awardsFor(scout: TroopScout): Promise<AwardInput[]> {
  const name = (await fullName(scout)).toLowerCase();
  if (!name) return [];
  const rows = await prisma.cohAward.findMany({
    where: { orgId: scout.orgId, recipient: { equals: name, mode: "insensitive" } },
    select: { award: true, category: true, event: { select: { startsAt: true } } },
  });
  return rows.map((r) => ({ award: r.award, category: r.category, at: r.event.startsAt }));
}

export async function journeyFor(scout: AccessibleScout): Promise<JourneySummary> {
  const troop = inTroop(scout) ? scout : null;
  const [progress, profile, awards, lantern] = await Promise.all([
    troop
      ? prisma.requirementProgress.findMany({
          where: { memberId: troop.memberId, orgId: troop.orgId },
          select: { requirementId: true, status: true, signedOffAt: true, updatedAt: true },
        })
      : [],
    troop
      ? prisma.scoutbookProfile.findUnique({
          where: { memberId: troop.memberId },
          select: { orgId: true, rank: true, rankAchievedAt: true, meritBadges: { select: { badgeName: true, status: true, completedAt: true } } },
        })
      : null,
    troop ? awardsFor(troop) : [],
    lanternFor(scout),
  ]);
  return summarizeJourney({
    catalog: loadCatalog(),
    progress,
    scoutbook: troop && profile && profile.orgId === troop.orgId ? profile : null,
    awards,
    lantern,
  });
}

export type ActivityItem = { at: Date; what: string; requirementId?: string };

const reqText = (idx: ReturnType<typeof itemIndex>, item: string, n: string) =>
  idx.get(item)?.reqs.flatMap((r) => (r.subs.length ? r.subs.map((s) => ({ id: s.id, t: s.t })) : [{ id: r.n, t: r.t }])).find((r) => r.id === n)?.t ?? null;

export async function recentActivity(scout: AccessibleScout, days: number): Promise<ActivityItem[]> {
  const since = new Date(Date.now() - days * DAY);
  const troop = inTroop(scout) ? scout : null;
  const lantern = await lanternFor(scout);
  const idx = itemIndex(loadCatalog());
  for (const c of Object.values(lantern?.custom ?? {})) if (!idx.has(c.key)) idx.set(c.key, c);
  const [events, badges, awards, checks] = await Promise.all([
    troop
      ? prisma.requirementProgressEvent.findMany({
          where: { memberId: troop.memberId, orgId: troop.orgId, createdAt: { gte: since } },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: { requirementId: true, fromStatus: true, toStatus: true, createdAt: true },
        })
      : [],
    troop
      ? prisma.scoutbookMeritBadge.findMany({
          where: { profile: { memberId: troop.memberId, orgId: troop.orgId }, completedAt: { gte: since } },
          select: { badgeName: true, completedAt: true },
        })
      : [],
    troop ? awardsFor(troop) : [],
    scout.journeyId
      ? prisma.journeyProgress.findMany({
          where: { scoutId: scout.journeyId, updatedAt: { gte: since } },
          orderBy: { updatedAt: "desc" },
          take: 100,
          select: { key: true, doneOn: true, updatedAt: true },
        })
      : [],
  ]);
  const words: Record<string, string> = {
    signed_off: "signed off",
    done: "marked done (waiting for a sign-off)",
    in_progress: "started",
    not_started: "reset to not started",
  };
  const out: ActivityItem[] = events.map((e) => {
    const [item, n] = e.requirementId.split("#");
    const text = reqText(idx, item, n);
    const verb = e.fromStatus === "signed_off" && e.toStatus !== "signed_off" ? "sign-off undone" : (words[e.toStatus] ?? e.toStatus);
    return {
      at: e.createdAt,
      requirementId: e.requirementId,
      what: `${itemName(item, idx)} requirement ${n}${text ? ` ("${text.slice(0, 120)}")` : ""}: ${verb}`,
    };
  });
  for (const c of checks) {
    const [item, n] = c.key.split("#");
    const text = n ? reqText(idx, item, n) : null;
    out.push({
      at: c.updatedAt,
      requirementId: n ? c.key : undefined,
      what: n
        ? `${itemName(item, idx)} requirement ${n}${text ? ` ("${text.slice(0, 120)}")` : ""}: checked off in Lantern${c.doneOn ? ` (done ${c.doneOn})` : ""}`
        : `${itemName(item, idx)}: marked complete in Lantern${c.doneOn ? ` (${c.doneOn})` : ""}`,
    });
  }
  for (const b of badges) out.push({ at: b.completedAt!, what: `Earned the ${b.badgeName} merit badge (Scoutbook)` });
  for (const a of awards) if (a.at && a.at >= since && a.at <= new Date()) out.push({ at: a.at, what: `Presented at court of honor: ${a.award}` });
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export type UpcomingEvent = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  category: string | null;
  /** The scout's RSVP, if one names them, else the adult's own. */
  rsvp: string | null;
  rsvpFor: "scout" | "you" | null;
  permissionSlipNeeded: boolean;
  permissionSlipSigned: boolean;
  /** A badge day open to sign-ups from Waypoint. */
  badgeDay: boolean;
};

export async function upcomingEvents(scout: AccessibleScout, userId: string, days: number): Promise<UpcomingEvent[]> {
  if (!inTroop(scout)) return [];
  const now = new Date();
  const until = new Date(now.getTime() + days * DAY);
  const events = await prisma.event.findMany({
    where: {
      orgId: scout.orgId,
      OR: [{ startsAt: { gte: now, lte: until } }, { endsAt: { gte: now }, startsAt: { lte: until } }],
    },
    orderBy: { startsAt: "asc" },
    take: 50,
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      location: true,
      category: true,
      publicSlug: true,
      requiresPermissionSlip: true,
    },
  });
  if (!events.length) return [];
  const ids = events.map((e) => e.id);
  const [rsvps, slips] = await Promise.all([
    prisma.rsvp.findMany({
      where: { eventId: { in: ids }, OR: [{ memberId: scout.memberId }, { userId }] },
      select: { eventId: true, memberId: true, userId: true, response: true },
    }),
    prisma.permissionSlip.findMany({ where: { eventId: { in: ids }, memberId: scout.memberId }, select: { eventId: true } }),
  ]);
  const signed = new Set(slips.map((s) => s.eventId));
  return events.map((e) => {
    const forScout = rsvps.find((r) => r.eventId === e.id && r.memberId === scout.memberId);
    const mine = rsvps.find((r) => r.eventId === e.id && r.userId === userId);
    const r = forScout ?? mine ?? null;
    return {
      id: e.id,
      title: e.title,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      location: e.location,
      category: e.category,
      rsvp: r?.response ?? null,
      rsvpFor: forScout ? "scout" : mine ? "you" : null,
      permissionSlipNeeded: e.requiresPermissionSlip,
      permissionSlipSigned: signed.has(e.id),
      badgeDay: !!e.publicSlug,
    };
  });
}

export type PendingSignoff = {
  item: string;
  itemName: string;
  requirements: { id: string; text: string | null; markedDoneAt: Date }[];
  /** Assigned counselors (badges) or "a unit leader" (ranks). */
  signsOff: string[];
};

export async function pendingSignoffs(scout: AccessibleScout): Promise<PendingSignoff[]> {
  if (!inTroop(scout)) return [];
  const idx = itemIndex(loadCatalog());
  const [rows, assignments] = await Promise.all([
    prisma.requirementProgress.findMany({
      where: { memberId: scout.memberId, orgId: scout.orgId, status: "done" },
      orderBy: { updatedAt: "asc" },
      select: { requirementId: true, updatedAt: true },
    }),
    prisma.counselorAssignment.findMany({
      where: { orgId: scout.orgId, memberId: scout.memberId },
      select: { badgeSlug: true, counselor: { select: { displayName: true } } },
    }),
  ]);
  const byItem = new Map<string, PendingSignoff>();
  for (const r of rows) {
    const [item, n] = r.requirementId.split("#");
    const entry =
      byItem.get(item) ??
      (() => {
        const slug = item.split(":")[1];
        const counselors = item.startsWith("badge:")
          ? assignments.filter((a) => a.badgeSlug === slug).map((a) => a.counselor.displayName)
          : [];
        const e: PendingSignoff = {
          item,
          itemName: itemName(item, idx),
          requirements: [],
          signsOff: counselors.length ? counselors : item.startsWith("badge:") ? ["a counselor (none assigned yet)"] : ["a unit leader"],
        };
        byItem.set(item, e);
        return e;
      })();
    const text = reqText(idx, item, n);
    entry.requirements.push({ id: r.requirementId, text, markedDoneAt: r.updatedAt });
  }
  return [...byItem.values()];
}

/** Per-requirement progress on one item, from the troop record and the adult's Lantern checks. */
export async function progressFor(scout: AccessibleScout, itemKey: string) {
  const [troop, checks] = await Promise.all([
    inTroop(scout)
      ? prisma.requirementProgress.findMany({
          where: { memberId: scout.memberId, orgId: scout.orgId, requirementId: { startsWith: `${itemKey}#` } },
          select: { requirementId: true, status: true, note: true, signedOffAt: true, updatedAt: true },
        })
      : [],
    scout.journeyId
      ? prisma.journeyProgress.findMany({
          where: { scoutId: scout.journeyId, OR: [{ key: itemKey }, { key: { startsWith: `${itemKey}#` } }] },
          select: { key: true, doneOn: true },
        })
      : [],
  ]);
  return {
    troop,
    lantern: checks.filter((c) => c.key !== itemKey).map((c) => ({ requirementId: c.key, doneOn: c.doneOn })),
    /** The whole item was checked off in Lantern. */
    itemChecked: checks.find((c) => c.key === itemKey)?.doneOn ?? (checks.some((c) => c.key === itemKey) ? "yes" : null),
  };
}

/** Custom items from the adult's Lantern trail, so tools can name them. */
export async function lanternCustom(scout: AccessibleScout) {
  return (await lanternFor(scout))?.custom ?? {};
}
