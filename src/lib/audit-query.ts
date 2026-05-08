// Shared audit-log query helpers used by /admin/audit (per-org) and
// /super-admin/audit (cross-org). Returns flat rows for the table view
// with simple cursor-style pagination via createdAt + id.

import { prisma } from "@/lib/db";

export type AuditFilter = {
  orgId?: string | null; // null = cross-org (super-admin only)
  entityType?: string | null;
  action?: string | null;
  q?: string | null;
  before?: Date | null;
  pageSize?: number;
};

export type AuditRow = {
  id: string;
  orgId: string | null;
  orgSlug: string | null;
  orgDisplayName: string | null;
  userId: string | null;
  userDisplay: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  summary: string | null;
  createdAt: Date;
};

const DEFAULT_PAGE = 100;

export async function listAuditLogs(filter: AuditFilter): Promise<{
  rows: AuditRow[];
  hasMore: boolean;
  nextBefore: Date | null;
}> {
  const take = Math.min(500, Math.max(10, filter.pageSize ?? DEFAULT_PAGE));
  const where: Record<string, unknown> = {};
  if (filter.orgId !== undefined) where.orgId = filter.orgId;
  if (filter.entityType) where.entityType = filter.entityType;
  if (filter.action) where.action = filter.action;
  if (filter.q?.trim()) {
    const q = filter.q.trim();
    where.OR = [
      { summary: { contains: q, mode: "insensitive" } },
      { entityId: { equals: q } },
      { userDisplay: { contains: q, mode: "insensitive" } },
    ];
  }
  if (filter.before) where.createdAt = { lt: filter.before };

  const rows = await prisma.auditLog.findMany({
    where: where as never,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    include: { org: { select: { slug: true, displayName: true } } },
  });

  const hasMore = rows.length > take;
  const trimmed = hasMore ? rows.slice(0, take) : rows;
  const nextBefore = hasMore ? trimmed[trimmed.length - 1]!.createdAt : null;

  return {
    rows: trimmed.map((r) => ({
      id: r.id,
      orgId: r.orgId,
      orgSlug: r.org?.slug ?? null,
      orgDisplayName: r.org?.displayName ?? null,
      userId: r.userId,
      userDisplay: r.userDisplay,
      entityType: r.entityType,
      entityId: r.entityId,
      action: r.action,
      summary: r.summary,
      createdAt: r.createdAt,
    })),
    hasMore,
    nextBefore,
  };
}

export async function entityTypeOptions(orgId: string | null = null): Promise<string[]> {
  const where = orgId === null ? {} : { orgId };
  const rows = await prisma.auditLog.findMany({
    where,
    select: { entityType: true },
    distinct: ["entityType"],
    orderBy: { entityType: "asc" },
    take: 50,
  });
  return rows.map((r) => r.entityType);
}
