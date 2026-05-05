// Resolve an org by id-or-slug for /api/v1 routes. Mobile uses orgId,
// some clients use slug; both should work.

import { prisma } from "@/lib/db";

export async function findOrgByIdOrSlug(idOrSlug: string) {
  if (!idOrSlug) return null;
  // Try id first (cuid is alphanumeric ~25 chars; slug is also alphanumeric).
  // We just probe both; cheap.
  const org = await prisma.org.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
  });
  return org;
}

export async function requireOrgMember(
  orgId: string,
  userId: string,
): Promise<{ role: string } | null> {
  const m = await prisma.orgMembership.findFirst({
    where: { orgId, userId },
    select: { role: true },
  });
  return m;
}
