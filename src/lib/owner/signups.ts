// The owner console's sign-ups queue: new units and new accounts from
// the last few weeks, newest first, with what each has done since and
// whether the owner already followed up. "Followed up" is an AuditLog
// row (action signup.followed_up), so the queue needs no table of its own.

import { prisma } from "@/lib/db";
import { licenseFor, type License } from "./license";
import { productsFor, type Product, UNIT_BILLING_SELECT } from "./console";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SignupItem =
  | {
      kind: "unit";
      id: string;
      at: Date;
      name: string;
      slug: string;
      email: string | null;
      ownerId: string | null;
      license: License;
      adults: number;
      scouts: number;
      followedUpAt: Date | null;
    }
  | {
      kind: "person";
      id: string;
      at: Date;
      name: string;
      email: string;
      products: Product[];
      units: number;
      followedUpAt: Date | null;
    };

export async function signupQueue(
  { days = 30, includeFollowedUp = false }: { days?: number; includeFollowedUp?: boolean } = {},
  now: Date = new Date(),
): Promise<SignupItem[]> {
  const since = new Date(now.getTime() - days * DAY_MS);
  const [orgs, users, marks] = await Promise.all([
    prisma.org.findMany({
      where: { createdAt: { gte: since }, isDemo: false },
      select: {
        ...UNIT_BILLING_SELECT,
        scoutmasterEmail: true,
        owner: { select: { id: true, email: true } },
        _count: { select: { memberships: true } },
      },
    }),
    prisma.user.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        email: true,
        displayName: true,
        createdAt: true,
        memberships: { select: { orgId: true } },
        apiTokens: { where: { revokedAt: null }, select: { name: true } },
        _count: { select: { journeyScouts: true, counselorBadges: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: { action: "signup.followed_up", createdAt: { gte: since } },
      select: { entityType: true, entityId: true, createdAt: true },
    }),
  ]);
  const mark = new Map(marks.map((m) => [`${m.entityType}:${m.entityId}`, m.createdAt]));
  const scouts = await prisma.member.groupBy({
    by: ["orgId"],
    where: { orgId: { in: orgs.map((o) => o.id) }, isYouth: true },
    _count: { _all: true },
  });
  const scoutsBy = new Map(scouts.map((s) => [s.orgId, s._count._all]));
  // Someone who signed up to start a unit shows once, as the unit.
  const unitOwners = new Set(orgs.map((o) => o.owner?.id).filter(Boolean));

  const items: SignupItem[] = [
    ...orgs.map((o) => ({
      kind: "unit" as const,
      id: o.id,
      at: o.createdAt,
      name: o.displayName,
      slug: o.slug,
      email: o.owner?.email ?? o.scoutmasterEmail,
      ownerId: o.owner?.id ?? null,
      license: licenseFor(o, now),
      adults: o._count.memberships,
      scouts: scoutsBy.get(o.id) ?? 0,
      followedUpAt: mark.get(`Org:${o.id}`) ?? null,
    })),
    ...users
      .filter((u) => !unitOwners.has(u.id))
      .map((u) => ({
        kind: "person" as const,
        id: u.id,
        at: u.createdAt,
        name: u.displayName,
        email: u.email,
        products: productsFor({
          units: u.memberships,
          lanternScouts: u._count.journeyScouts,
          counselorBadges: u._count.counselorBadges,
          apps: u.apiTokens.map((t) => t.name),
        }),
        units: u.memberships.length,
        followedUpAt: mark.get(`User:${u.id}`) ?? null,
      })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return includeFollowedUp ? items : items.filter((i) => !i.followedUpAt);
}
