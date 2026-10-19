// The owner console's errors view: ErrorLog rows grouped by fingerprint
// (the same exception from the same place), with how often, since when,
// which units and how many people it hit, and whether the owner marked
// it fixed. A fixed group comes back when it happens again.

import { prisma } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ErrorGroup = {
  fingerprint: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  name: string;
  message: string;
  service: string;
  path: string | null;
  units: number;
  people: number;
  fixedAt: Date | null;
  /** Marked fixed and not seen since. */
  fixed: boolean;
};

export function isFixed(lastSeen: Date, resolvedAt: Date | null | undefined): boolean {
  return !!resolvedAt && lastSeen.getTime() <= resolvedAt.getTime();
}

export async function errorGroups(
  { days = 7, service, orgId, showFixed = false }: { days?: number; service?: string | null; orgId?: string | null; showFixed?: boolean },
  now: Date = new Date(),
): Promise<ErrorGroup[]> {
  const where = {
    createdAt: { gte: new Date(now.getTime() - days * DAY_MS) },
    ...(service ? { service } : {}),
    ...(orgId ? { orgId } : {}),
  };
  const groups = await prisma.errorLog.groupBy({
    by: ["fingerprint"],
    where,
    _count: { _all: true },
    _min: { createdAt: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
    take: 200,
  });
  const fps = groups.map((g) => g.fingerprint);
  const [latest, spread, resolutions] = await Promise.all([
    prisma.errorLog.findMany({
      where: { ...where, fingerprint: { in: fps } },
      orderBy: { createdAt: "desc" },
      distinct: ["fingerprint"],
      select: { fingerprint: true, errorName: true, message: true, service: true, path: true },
    }),
    prisma.errorLog.groupBy({
      by: ["fingerprint", "orgId", "userId"],
      where: { ...where, fingerprint: { in: fps } },
    }),
    prisma.errorResolution.findMany({ where: { fingerprint: { in: fps } } }),
  ]);
  const latestBy = new Map(latest.map((l) => [l.fingerprint, l]));
  const resolvedBy = new Map(resolutions.map((r) => [r.fingerprint, r.resolvedAt]));
  const units = new Map<string, Set<string>>();
  const people = new Map<string, Set<string>>();
  for (const s of spread) {
    if (s.orgId) (units.get(s.fingerprint) ?? units.set(s.fingerprint, new Set()).get(s.fingerprint)!).add(s.orgId);
    if (s.userId) (people.get(s.fingerprint) ?? people.set(s.fingerprint, new Set()).get(s.fingerprint)!).add(s.userId);
  }
  const out = groups.map((g) => {
    const l = latestBy.get(g.fingerprint);
    const lastSeen = g._max.createdAt!;
    const fixedAt = resolvedBy.get(g.fingerprint) ?? null;
    return {
      fingerprint: g.fingerprint,
      count: g._count._all,
      firstSeen: g._min.createdAt!,
      lastSeen,
      name: l?.errorName || "Error",
      message: l?.message ?? "",
      service: l?.service ?? "compass",
      path: l?.path ?? null,
      units: units.get(g.fingerprint)?.size ?? 0,
      people: people.get(g.fingerprint)?.size ?? 0,
      fixedAt,
      fixed: isFixed(lastSeen, fixedAt),
    };
  });
  return showFixed ? out : out.filter((g) => !g.fixed);
}

export async function errorServices(): Promise<string[]> {
  const rows = await prisma.errorLog.groupBy({ by: ["service"], where: { service: { not: null } } });
  return rows.map((r) => r.service!).sort();
}
