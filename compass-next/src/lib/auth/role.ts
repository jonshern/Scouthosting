import { prisma } from "@/lib/db";

export type Role = "scout" | "parent" | "leader" | "admin";

export async function roleInOrg(userId: string | null, orgId: string | null): Promise<Role | null> {
  if (!userId || !orgId) return null;
  const m = await prisma.orgMembership.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: { role: true },
  });
  return (m?.role as Role) ?? null;
}

export async function isOwnerOfOrg(userId: string | null, orgId: string | null): Promise<boolean> {
  if (!userId || !orgId) return false;
  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { ownerId: true } });
  return org?.ownerId === userId;
}

export async function isPrivilegedUser(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isSuperAdmin: true,
      memberships: { where: { role: "admin" }, select: { id: true }, take: 1 },
    },
  });
  if (!u) return false;
  return u.isSuperAdmin || u.memberships.length > 0;
}

const LEADER_ROLES: ReadonlyArray<Role> = ["leader", "admin"];

export function isLeaderRole(role: Role | null | undefined): boolean {
  return role !== null && role !== undefined && LEADER_ROLES.includes(role);
}
