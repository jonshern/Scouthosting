// The unit's Advancement page: where every active scout stands, what's
// waiting for a leader's sign-off, and what's earned but not yet
// presented at a court of honor.
//
// It reads the same records the Claude connector explains one scout at
// a time (lib/mcp/journey.ts summarizeJourney): troop sign-offs from
// Compass, Waypoint and Lantern (RequirementProgress), the Scoutbook
// import and court of honor awards. A family's own Lantern trail is not
// included: leaders see the troop's record, not the family's notes.
//
// No authorization here; the page and CSV route are leader-gated.

import type { Org } from "@prisma/client";
import { prisma } from "@/lib/db";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { badgeKeyForName, itemIndex, itemName, loadCatalog, rankKeyForName, type Catalog } from "@/lib/mcp/catalog";
import { summarizeJourney, type JourneySummary } from "@/lib/mcp/journey";

const DAY = 86_400_000;
/** "Ready for a court of honor" looks back this far, so years of Scoutbook history don't all show up. */
export const COH_LOOKBACK_DAYS = 365;

export type ScoutAdvancement = {
  memberId: string;
  name: string;
  patrol: string | null;
  summary: JourneySummary;
  waiting: number;
};

export type WaitingSignOff = {
  memberId: string;
  name: string;
  patrol: string | null;
  requirementId: string;
  itemName: string;
  number: string;
  text: string | null;
  since: Date;
};

export type ReadyAward = { memberId: string; name: string; award: string; kind: "rank" | "badge"; earnedAt: Date | null };

export type UnitAdvancement = {
  catalogLoaded: boolean;
  scouts: ScoutAdvancement[];
  waiting: WaitingSignOff[];
  ready: ReadyAward[];
  patrols: string[];
};

/** The requirement's words from the catalog, or null. */
export function requirementText(catalog: Catalog | null, requirementId: string): { item: string; number: string; text: string | null } {
  const idx = itemIndex(catalog);
  const [key, number = ""] = requirementId.split("#");
  const found = idx.get(key);
  const text = found
    ? (found.reqs
        .flatMap((r) => (r.subs.length ? r.subs.map((s) => ({ id: s.id, t: s.t })) : [{ id: r.n, t: r.t }]))
        .find((r) => r.id === number)?.t ?? null)
    : null;
  return { item: itemName(key, idx), number: number.replace(/-opt([A-Za-z0-9]+)$/, " (option $1)"), text };
}

/** Awards earned recently that the unit hasn't recorded as presented. Pure, for tests. */
export function readyForCourtOfHonor(
  s: Pick<ScoutAdvancement, "memberId" | "name" | "summary">,
  presented: { award: string; category: string | null }[],
  catalog: Catalog | null,
  now: Date = new Date(),
): ReadyAward[] {
  const since = now.getTime() - COH_LOOKBACK_DAYS * DAY;
  const done = new Set<string>();
  for (const a of presented) {
    const rank = a.category === "Rank" || /\brank\b/i.test(a.award) ? rankKeyForName(a.award) : null;
    if (rank) done.add(rank);
    else done.add(badgeKeyForName(a.award, catalog));
  }
  const out: ReadyAward[] = [];
  const r = s.summary.rank;
  if (r && r.source !== "court_of_honor" && !done.has(r.key) && r.since && r.since.getTime() >= since) {
    out.push({ memberId: s.memberId, name: s.name, award: `${r.name} rank`, kind: "rank", earnedAt: r.since });
  }
  for (const b of s.summary.badgesEarned) {
    if (b.source === "court_of_honor" || b.source === "lantern" || done.has(b.key)) continue;
    if (!b.earnedAt || b.earnedAt.getTime() < since) continue;
    out.push({ memberId: s.memberId, name: s.name, award: `${b.name} merit badge`, kind: "badge", earnedAt: b.earnedAt });
  }
  return out;
}

export async function unitAdvancement(org: Pick<Org, "id" | "encryptedDek">, opts: { patrol?: string | null } = {}): Promise<UnitAdvancement> {
  const catalog = loadCatalog();
  if (!org.encryptedDek) return { catalogLoaded: !!catalog, scouts: [], waiting: [], ready: [], patrols: [] };

  const members = await prisma.member.findMany({
    where: { orgId: org.id, deletedAt: null, status: "active", isYouth: true },
    select: { id: true, patrol: true, encFirstName: true, encLastName: true, encPhone: true, encStreet: true, encCity: true, encState: true, encZip: true },
  });
  const patrols = [...new Set(members.map((m) => m.patrol).filter((p): p is string => !!p))].sort((a, b) => a.localeCompare(b));
  const shown = opts.patrol ? members.filter((m) => m.patrol === opts.patrol) : members;
  const ids = shown.map((m) => m.id);

  const [progress, profiles, awards] = await Promise.all([
    prisma.requirementProgress.findMany({
      where: { orgId: org.id, memberId: { in: ids } },
      select: { memberId: true, requirementId: true, status: true, signedOffAt: true, updatedAt: true },
    }),
    prisma.scoutbookProfile.findMany({
      where: { orgId: org.id, memberId: { in: ids } },
      select: { memberId: true, rank: true, rankAchievedAt: true, meritBadges: { select: { badgeName: true, status: true, completedAt: true } } },
    }),
    prisma.cohAward.findMany({
      where: { orgId: org.id },
      select: { recipient: true, award: true, category: true, event: { select: { startsAt: true } } },
    }),
  ]);

  const byMember = new Map<string, typeof progress>();
  for (const p of progress) byMember.set(p.memberId, [...(byMember.get(p.memberId) ?? []), p]);
  const profileBy = new Map(profiles.map((p) => [p.memberId, p]));
  // CohAward stores the recipient as typed ("Alex Smith"), so match on the full name.
  const awardsBy = new Map<string, typeof awards>();
  for (const a of awards) {
    const k = a.recipient.trim().toLowerCase();
    awardsBy.set(k, [...(awardsBy.get(k) ?? []), a]);
  }

  const dek = unwrapDekWithMaster(org);
  const scouts: ScoutAdvancement[] = [];
  const waiting: WaitingSignOff[] = [];
  const ready: ReadyAward[] = [];
  for (const m of shown) {
    const pii = decryptMemberPii(m, dek, org.id);
    const name = `${pii.firstName} ${pii.lastName}`.trim();
    const rows = byMember.get(m.id) ?? [];
    const presented = awardsBy.get(name.toLowerCase()) ?? [];
    const summary = summarizeJourney({
      catalog,
      progress: rows,
      scoutbook: profileBy.get(m.id) ?? null,
      awards: presented.map((a) => ({ award: a.award, category: a.category, at: a.event.startsAt })),
      lantern: null,
    });
    const done = rows.filter((r) => r.status === "done");
    for (const r of done) {
      const t = requirementText(catalog, r.requirementId);
      waiting.push({ memberId: m.id, name, patrol: m.patrol, requirementId: r.requirementId, itemName: t.item, number: t.number, text: t.text, since: r.updatedAt });
    }
    const s = { memberId: m.id, name, patrol: m.patrol, summary, waiting: done.length };
    scouts.push(s);
    ready.push(...readyForCourtOfHonor(s, presented, catalog));
  }

  scouts.sort((a, b) => a.name.localeCompare(b.name));
  waiting.sort((a, b) => a.since.getTime() - b.since.getTime());
  ready.sort((a, b) => a.name.localeCompare(b.name) || (a.kind === b.kind ? a.award.localeCompare(b.award) : a.kind === "rank" ? -1 : 1));
  return { catalogLoaded: !!catalog, scouts, waiting, ready, patrols };
}
