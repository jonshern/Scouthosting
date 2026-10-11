// Who may see and change a unit's money: the treasury pages, ledger and
// report CSVs, refunds, reimbursements and the treasury server actions.
//
// Admins and super-admins always may. A leader may only when their roster
// entry (the Member with their email) holds a position that carries the
// treasurer scope (lib/auth/permissions.ts: Treasurer, Purser, Cookie
// Manager, …). Other leaders, parents and scouts may not.

import { prisma } from "@/lib/db";
import { roleInOrg } from "./role";
import { checkScope, SCOPES } from "./permissions";

export function treasuryAllowed(
  role: string | null | undefined,
  positions: ReadonlyArray<string | null | undefined>,
  isSuperAdmin = false,
): boolean {
  if (isSuperAdmin || role === "admin") return true;
  if (role !== "leader") return false;
  return positions.some((position) => checkScope({ role, position }, SCOPES.TREASURER).ok);
}

export async function canManageTreasury(
  user: { id: string; email: string; isSuperAdmin?: boolean },
  orgId: string,
): Promise<boolean> {
  if (user.isSuperAdmin) return true;
  const role = await roleInOrg(user.id, orgId);
  if (role === "admin") return true;
  if (role !== "leader") return false;
  const members = await prisma.member.findMany({
    where: { orgId, email: { equals: user.email, mode: "insensitive" }, deletedAt: null },
    select: { position: true },
  });
  return treasuryAllowed(role, members.map((m) => m.position));
}

export const TREASURY_FORBIDDEN =
  "Only admins and the unit's treasurer can use the treasury.";
