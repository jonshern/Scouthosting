// Permission slip status helpers — used by both the per-event status
// page and the org-wide needed-by-event / needed-by-scout reports.

import type { Org } from "@prisma/client";
import { prisma } from "@/lib/db";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";

export type SlipStatusRow = {
  memberId: string;
  scoutName: string;
  patrol: string | null;
  signed: boolean;
  signedAt: Date | null;
  signedByName: string | null;
};

export async function eventSlipStatus(
  org: Pick<Org, "id" | "encryptedDek">,
  eventId: string,
): Promise<SlipStatusRow[]> {
  if (!org.encryptedDek) return [];
  const rsvps = await prisma.rsvp.findMany({
    where: { orgId: org.id, eventId, response: "yes", memberId: { not: null } },
    include: { member: true },
  });
  const youthRsvps = rsvps.filter((r) => r.member?.isYouth);

  const slips = await prisma.permissionSlip.findMany({
    where: { orgId: org.id, eventId },
  });
  const byMember = new Map(slips.map((s) => [s.memberId, s]));

  const dek = unwrapDekWithMaster(org);
  const rows: SlipStatusRow[] = youthRsvps.map((r) => {
    const m = r.member!;
    const pii = decryptMemberPii(m, dek, org.id);
    const slip = byMember.get(m.id);
    return {
      memberId: m.id,
      scoutName: `${pii.firstName} ${pii.lastName}`.trim(),
      patrol: m.patrol,
      signed: !!slip,
      signedAt: slip?.signedAt ?? null,
      signedByName: slip?.signedByName ?? null,
    };
  });
  rows.sort((a, b) => {
    if (a.signed !== b.signed) return a.signed ? 1 : -1;
    return a.scoutName.localeCompare(b.scoutName);
  });
  return rows;
}

export type EventSlipSummary = {
  eventId: string;
  title: string;
  startsAt: Date;
  needed: number;
  signed: number;
};

/** All upcoming events that require a slip, with signed/needed counts. */
export async function upcomingEventsNeedingSlips(
  org: Pick<Org, "id">,
  windowDays = 60,
): Promise<EventSlipSummary[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + windowDays * 86400_000);

  const events = await prisma.event.findMany({
    where: {
      orgId: org.id,
      requiresPermissionSlip: true,
      startsAt: { gte: now, lte: horizon },
    },
    orderBy: { startsAt: "asc" },
    select: { id: true, title: true, startsAt: true },
  });
  if (events.length === 0) return [];

  const eventIds = events.map((e) => e.id);

  // Yes-RSVPs per event for youths (linked Member, isYouth = true).
  const youthRsvps = await prisma.rsvp.findMany({
    where: {
      orgId: org.id,
      eventId: { in: eventIds },
      response: "yes",
      memberId: { not: null },
      member: { isYouth: true },
    },
    select: { eventId: true, memberId: true },
  });
  const neededByEvent = new Map<string, Set<string>>();
  for (const r of youthRsvps) {
    if (!r.memberId) continue;
    const set = neededByEvent.get(r.eventId) ?? new Set<string>();
    set.add(r.memberId);
    neededByEvent.set(r.eventId, set);
  }

  const slips = await prisma.permissionSlip.findMany({
    where: { orgId: org.id, eventId: { in: eventIds } },
    select: { eventId: true, memberId: true },
  });
  const signedByEvent = new Map<string, Set<string>>();
  for (const s of slips) {
    const set = signedByEvent.get(s.eventId) ?? new Set<string>();
    set.add(s.memberId);
    signedByEvent.set(s.eventId, set);
  }

  return events.map((e) => {
    const needed = neededByEvent.get(e.id)?.size ?? 0;
    const signed = signedByEvent.get(e.id)?.size ?? 0;
    return { eventId: e.id, title: e.title, startsAt: e.startsAt, needed, signed };
  });
}

export type ScoutSlipRow = {
  memberId: string;
  scoutName: string;
  patrol: string | null;
  outstanding: { eventId: string; title: string; startsAt: Date }[];
};

/** Scouts who still owe at least one signature in the next windowDays. */
export async function scoutsWithOutstandingSlips(
  org: Pick<Org, "id" | "encryptedDek">,
  windowDays = 60,
): Promise<ScoutSlipRow[]> {
  if (!org.encryptedDek) return [];
  const now = new Date();
  const horizon = new Date(now.getTime() + windowDays * 86400_000);

  const events = await prisma.event.findMany({
    where: {
      orgId: org.id,
      requiresPermissionSlip: true,
      startsAt: { gte: now, lte: horizon },
    },
    select: { id: true, title: true, startsAt: true },
  });
  if (events.length === 0) return [];
  const eventIds = events.map((e) => e.id);
  const eventById = new Map(events.map((e) => [e.id, e]));

  const youthRsvps = await prisma.rsvp.findMany({
    where: {
      orgId: org.id,
      eventId: { in: eventIds },
      response: "yes",
      memberId: { not: null },
      member: { isYouth: true },
    },
    include: { member: true },
  });
  const slipped = await prisma.permissionSlip.findMany({
    where: { orgId: org.id, eventId: { in: eventIds } },
    select: { eventId: true, memberId: true },
  });
  const signedKey = new Set(slipped.map((s) => `${s.eventId}:${s.memberId}`));

  const dek = unwrapDekWithMaster(org);
  const byMember = new Map<string, ScoutSlipRow>();
  for (const r of youthRsvps) {
    if (!r.memberId || !r.member) continue;
    if (signedKey.has(`${r.eventId}:${r.memberId}`)) continue;
    const ev = eventById.get(r.eventId);
    if (!ev) continue;
    let row = byMember.get(r.memberId);
    if (!row) {
      const pii = decryptMemberPii(r.member, dek, org.id);
      row = {
        memberId: r.memberId,
        scoutName: `${pii.firstName} ${pii.lastName}`.trim(),
        patrol: r.member.patrol,
        outstanding: [],
      };
      byMember.set(r.memberId, row);
    }
    row.outstanding.push({ eventId: ev.id, title: ev.title, startsAt: ev.startsAt });
  }
  const rows = [...byMember.values()];
  for (const row of rows) {
    row.outstanding.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }
  rows.sort((a, b) => a.scoutName.localeCompare(b.scoutName));
  return rows;
}
