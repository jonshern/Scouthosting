// Reads for the owner console (/super-admin): every unit with its
// license, every account with the products it uses, and the counts on
// the overview. Only the console calls these; the layout checks
// isSuperAdmin before any page renders.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { licenseFor, type License, type LicenseKind } from "./license";

const DAY_MS = 24 * 60 * 60 * 1000;

export const UNIT_BILLING_SELECT = {
  id: true,
  slug: true,
  displayName: true,
  unitType: true,
  unitNumber: true,
  city: true,
  state: true,
  plan: true,
  isDemo: true,
  subscriptionStatus: true,
  trialEndsAt: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  suspendedAt: true,
  suspendedReason: true,
  compedUntil: true,
  compedNote: true,
  stripeSubscriptionId: true,
  stripePriceId: true,
  createdAt: true,
} satisfies Prisma.OrgSelect;

export type UnitRow = Prisma.OrgGetPayload<{ select: typeof UNIT_BILLING_SELECT }> & {
  license: License;
  adults: number;
  scouts: number;
  owner: { id: string; email: string; displayName: string } | null;
};

export async function listUnits(
  { kind, q }: { kind?: LicenseKind | null; q?: string | null } = {},
  now: Date = new Date(),
): Promise<UnitRow[]> {
  const term = q?.trim();
  const orgs = await prisma.org.findMany({
    where: term
      ? {
          OR: [
            { slug: { contains: term, mode: "insensitive" } },
            { displayName: { contains: term, mode: "insensitive" } },
            { scoutmasterEmail: { contains: term, mode: "insensitive" } },
            { city: { contains: term, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      ...UNIT_BILLING_SELECT,
      owner: { select: { id: true, email: true, displayName: true } },
      _count: { select: { memberships: true } },
    },
  });
  const scouts = await prisma.member.groupBy({
    by: ["orgId"],
    where: { orgId: { in: orgs.map((o) => o.id) }, isYouth: true },
    _count: { _all: true },
  });
  const scoutsByOrg = new Map(scouts.map((s) => [s.orgId, s._count._all]));
  const rows = orgs.map(({ _count, ...o }) => ({
    ...o,
    license: licenseFor(o, now),
    adults: _count.memberships,
    scouts: scoutsByOrg.get(o.id) ?? 0,
  }));
  return kind ? rows.filter((r) => r.license.kind === kind) : rows;
}

export type Overview = {
  units: Record<LicenseKind, number>;
  totalUnits: number;
  accounts: number;
  newAccounts7d: number;
  newUnits7d: number;
  lanternFamilies: number;
  lanternScouts: number;
  counselors: number;
  trialsEndingSoon: UnitRow[];
  needsAttention: UnitRow[];
  recentUnits: UnitRow[];
  errors24h: number;
  errorKinds24h: number;
  openTickets: number;
  newFeedback: number;
};

export async function overview(now: Date = new Date()): Promise<Overview> {
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const [units, accounts, newAccounts7d, lanternFamilies, lanternScouts, counselors, errors24h, errorKinds, openTickets, newFeedback] =
    await Promise.all([
      listUnits({}, now),
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.user.count({ where: { journeyScouts: { some: {} } } }),
      prisma.journeyScout.count(),
      prisma.user.count({ where: { counselorBadges: { some: {} } } }),
      prisma.errorLog.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.errorLog.groupBy({ by: ["fingerprint"], where: { createdAt: { gte: dayAgo } } }),
      prisma.supportTicket.count({ where: { status: { in: ["open", "acknowledged"] } } }),
      prisma.feedbackRequest.count({ where: { status: "submitted" } }),
    ]);

  const counts = Object.fromEntries(
    (["trial", "trial_ended", "paid", "canceling", "past_due", "canceled", "comped", "suspended", "demo", "legacy"] as LicenseKind[]).map(
      (k) => [k, 0],
    ),
  ) as Record<LicenseKind, number>;
  for (const u of units) counts[u.license.kind] += 1;

  const soon = now.getTime() + 7 * DAY_MS;
  const trialsEndingSoon = units
    .filter((u) => u.license.kind === "trial" && u.license.until && u.license.until.getTime() <= soon)
    .sort((a, b) => a.license.until!.getTime() - b.license.until!.getTime());
  const needsAttention = units.filter((u) =>
    ["past_due", "trial_ended", "suspended", "canceling"].includes(u.license.kind),
  );

  return {
    units: counts,
    totalUnits: units.filter((u) => !u.isDemo).length,
    accounts,
    newAccounts7d,
    newUnits7d: units.filter((u) => u.createdAt >= weekAgo).length,
    lanternFamilies,
    lanternScouts,
    counselors,
    trialsEndingSoon,
    needsAttention,
    recentUnits: units.slice(0, 8),
    errors24h,
    errorKinds24h: errorKinds.length,
    openTickets,
    newFeedback,
  };
}

// ---------------------------------------------------------------------
// People

export type Product = "compass" | "waypoint" | "lantern";

export const PRODUCT_LABEL: Record<Product, string> = {
  compass: "Compass",
  waypoint: "Waypoint",
  lantern: "Lantern",
};

export type PersonRow = {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
  isSuperAdmin: boolean;
  disabledAt: Date | null;
  units: { slug: string; displayName: string; role: string }[];
  lanternScouts: number;
  counselorBadges: number;
  apps: string[];
  products: Product[];
};

/** Which products an account uses, from what it has in each. */
export function productsFor(p: {
  units: unknown[];
  lanternScouts: number;
  counselorBadges: number;
  apps: string[];
}): Product[] {
  const out: Product[] = [];
  if (p.units.length) out.push("compass");
  if (p.counselorBadges > 0 || p.apps.some((a) => a.startsWith("Waypoint"))) out.push("waypoint");
  if (p.lanternScouts > 0 || p.apps.some((a) => a.startsWith("Lantern"))) out.push("lantern");
  return out;
}

export async function listPeople(
  { q, product }: { q?: string | null; product?: Product | "none" | null } = {},
): Promise<PersonRow[]> {
  const term = q?.trim();
  const users = await prisma.user.findMany({
    where: term
      ? {
          OR: [
            { email: { contains: term, mode: "insensitive" } },
            { displayName: { contains: term, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      email: true,
      displayName: true,
      createdAt: true,
      isSuperAdmin: true,
      disabledAt: true,
      memberships: { select: { role: true, org: { select: { slug: true, displayName: true } } } },
      apiTokens: { where: { revokedAt: null }, select: { name: true } },
      _count: { select: { journeyScouts: true, counselorBadges: true } },
    },
  });
  const rows = users.map((u) => {
    const apps = [...new Set(u.apiTokens.map((t) => t.name))];
    const base = {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      createdAt: u.createdAt,
      isSuperAdmin: u.isSuperAdmin,
      disabledAt: u.disabledAt,
      units: u.memberships.map((m) => ({ slug: m.org.slug, displayName: m.org.displayName, role: m.role })),
      lanternScouts: u._count.journeyScouts,
      counselorBadges: u._count.counselorBadges,
      apps,
    };
    return { ...base, products: productsFor(base) };
  });
  if (!product) return rows;
  if (product === "none") return rows.filter((r) => r.products.length === 0);
  return rows.filter((r) => r.products.includes(product));
}
