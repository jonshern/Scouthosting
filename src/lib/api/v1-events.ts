// Event lookups shared by the /api/v1/events/:id/* routes.

import { prisma } from "@/lib/db";
import {
  LEADER_ROLES,
  notFound,
  parseId,
  requireOrgAccessForResource,
  type OrgAccess,
} from "@/lib/api/v1";
import type { StaffEvent } from "@/lib/events/staff";

const EVENT_SELECT = { id: true, orgId: true, title: true, startsAt: true, location: true } as const;

/**
 * Load an event the caller may act on. An event in an org the caller
 * doesn't belong to is a 404, like a missing one. `leader` requires a
 * leader/admin role (else 403 forbidden/role); `write` refuses
 * suspended orgs.
 */
export async function loadEventForUser(
  rawId: unknown,
  userId: string,
  opts: { leader?: boolean; write?: boolean } = {},
): Promise<{ event: StaffEvent; access: OrgAccess }> {
  const id = parseId(rawId);
  const event = await prisma.event.findUnique({ where: { id }, select: EVENT_SELECT });
  if (!event) throw notFound();
  const access = await requireOrgAccessForResource(event.orgId, userId, {
    write: opts.write,
    roles: opts.leader ? LEADER_ROLES : undefined,
  });
  return { event, access };
}

/** The bearer user's email-verified flag (ApiUser doesn't carry it). */
export async function loadVerifiedUser(user: { id: string; email: string }) {
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { emailVerified: true } });
  return { id: user.id, email: user.email, emailVerified: !!row?.emailVerified };
}
