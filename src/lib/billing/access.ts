// Who may see and change a unit's subscription: its owner, its admins,
// and super-admins. Leaders run the unit day to day but don't hold the
// card.

import { prisma } from "@/lib/db";

export async function canManageBilling(
  user: { id: string },
  org: { id: string; ownerId: string | null },
): Promise<boolean> {
  if (org.ownerId === user.id) return true;
  const u = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      isSuperAdmin: true,
      memberships: { where: { orgId: org.id }, select: { role: true }, take: 1 },
    },
  });
  if (!u) return false;
  return u.isSuperAdmin || u.memberships[0]?.role === "admin";
}
