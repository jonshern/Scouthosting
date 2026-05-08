// Resolve "my scouts" for a signed-in user — every roster Member
// across all orgs whose parentIds include the user's own member row(s)
// in that org. We match user → member by email (plaintext column on
// Member). One user with the same email may show up as a Member in
// several orgs; we collect children across all of them.
//
// Returns plaintext rows (PII decrypted with each org's DEK) for the
// portal page. Per-org DEK unwrap happens once and is reused for the
// scout + slip + balance queries.

import { prisma } from "@/lib/db";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";

export type ScoutCard = {
  orgId: string;
  orgSlug: string;
  orgDisplayName: string;
  memberId: string;
  scoutName: string;
  patrol: string | null;
  position: string | null;
  balanceCents: number | null;
  recentTransactions: {
    id: string;
    postedAt: Date;
    description: string;
    amountCents: number;
    fundName: string;
  }[];
  scoutbook: {
    rank: string | null;
    rankAchievedAt: Date | null;
    serviceHours: number;
    campingNights: number;
    hikingMiles: number;
    syncedAt: Date;
    scoutbookUserId: string;
  } | null;
  upcoming: {
    eventId: string;
    title: string;
    startsAt: Date;
    location: string | null;
    rsvp: "yes" | "no" | "maybe" | null;
    requiresPermissionSlip: boolean;
    slipSigned: boolean;
  }[];
};

export async function myScoutsForUser(
  user: { id: string; email: string },
  windowDays = 90,
): Promise<ScoutCard[]> {
  const email = user.email.toLowerCase();
  const parentMembers = await prisma.member.findMany({
    where: { email, deletedAt: null },
    include: { org: true },
  });
  if (parentMembers.length === 0) return [];

  const now = new Date();
  const horizon = new Date(now.getTime() + windowDays * 86400_000);
  const cards: ScoutCard[] = [];

  for (const parent of parentMembers) {
    const org = parent.org;
    if (!org.encryptedDek) continue;
    const children = await prisma.member.findMany({
      where: { orgId: org.id, parentIds: { has: parent.id }, deletedAt: null },
    });
    if (children.length === 0) continue;

    const childIds = children.map((c) => c.id);
    const [rsvps, slips, events, subaccounts, recentTxns, sbProfiles] = await Promise.all([
      prisma.rsvp.findMany({
        where: {
          orgId: org.id,
          memberId: { in: childIds },
          event: { startsAt: { gte: now, lte: horizon } },
        },
        select: { memberId: true, eventId: true, response: true },
      }),
      prisma.permissionSlip.findMany({
        where: { orgId: org.id, memberId: { in: childIds } },
        select: { memberId: true, eventId: true },
      }),
      prisma.event.findMany({
        where: { orgId: org.id, startsAt: { gte: now, lte: horizon } },
        select: {
          id: true,
          title: true,
          startsAt: true,
          location: true,
          requiresPermissionSlip: true,
        },
        orderBy: { startsAt: "asc" },
      }),
      prisma.memberSubaccount.findMany({
        where: { orgId: org.id, memberId: { in: childIds } },
        select: { memberId: true, balanceCents: true },
      }),
      prisma.transaction.findMany({
        where: { orgId: org.id, memberId: { in: childIds } },
        orderBy: { postedAt: "desc" },
        take: childIds.length * 5,
        include: { fund: { select: { name: true } } },
      }),
      prisma.scoutbookProfile.findMany({
        where: { orgId: org.id, memberId: { in: childIds } },
      }),
    ]);
    const sbByMember = new Map(sbProfiles.map((p) => [p.memberId, p]));

    const rsvpKey = new Map<string, "yes" | "no" | "maybe">();
    for (const r of rsvps) {
      const key = `${r.memberId}:${r.eventId}`;
      rsvpKey.set(key, r.response as "yes" | "no" | "maybe");
    }
    const slipKey = new Set(slips.map((s) => `${s.memberId}:${s.eventId}`));
    const balanceByMember = new Map(
      subaccounts.map((s) => [s.memberId, s.balanceCents] as const),
    );
    const txnsByMember = new Map<string, ScoutCard["recentTransactions"]>();
    for (const t of recentTxns) {
      if (!t.memberId) continue;
      const list = txnsByMember.get(t.memberId) ?? [];
      if (list.length < 5) {
        list.push({
          id: t.id,
          postedAt: t.postedAt,
          description: t.description,
          amountCents: t.amountCents,
          fundName: t.fund.name,
        });
        txnsByMember.set(t.memberId, list);
      }
    }

    const dek = unwrapDekWithMaster(org);

    for (const c of children) {
      const pii = decryptMemberPii(c, dek, org.id);
      const upcoming = events
        .map((e) => {
          const k = `${c.id}:${e.id}`;
          const rsvp = rsvpKey.get(k) ?? null;
          if (!rsvp && !e.requiresPermissionSlip) return null;
          return {
            eventId: e.id,
            title: e.title,
            startsAt: e.startsAt,
            location: e.location,
            rsvp,
            requiresPermissionSlip: e.requiresPermissionSlip,
            slipSigned: slipKey.has(k),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      const sb = sbByMember.get(c.id);
      cards.push({
        orgId: org.id,
        orgSlug: org.slug,
        orgDisplayName: org.displayName,
        memberId: c.id,
        scoutName: `${pii.firstName} ${pii.lastName}`.trim(),
        patrol: c.patrol,
        position: c.position,
        balanceCents: balanceByMember.get(c.id) ?? null,
        recentTransactions: txnsByMember.get(c.id) ?? [],
        scoutbook: sb
          ? {
              rank: sb.rank,
              rankAchievedAt: sb.rankAchievedAt,
              serviceHours: sb.serviceHours,
              campingNights: sb.campingNights,
              hikingMiles: sb.hikingMiles,
              syncedAt: sb.syncedAt,
              scoutbookUserId: sb.scoutbookUserId,
            }
          : null,
        upcoming,
      });
    }
  }

  cards.sort((a, b) => a.scoutName.localeCompare(b.scoutName));
  return cards;
}
