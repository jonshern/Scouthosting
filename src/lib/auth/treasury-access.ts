// Who may see and change a unit's money: the treasury pages, ledger and
// report CSVs, refunds, reimbursements and the treasury server actions.
//
// Admins and super-admins always may. A leader may only when their roster
// entry (the Member with their email) holds a position that carries the
// treasurer scope (lib/auth/permissions.ts: Treasurer, Purser, Cookie
// Manager, …). Other leaders, parents and scouts may not.

import { prisma } from "@/lib/db";
import { roleInOrg } from "./role";
import { checkScope, positionHasScope, SCOPES } from "./permissions";

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

// Treasury access follows the treasurer position on the roster, so giving
// someone that position (or pointing a treasurer row at another email) is
// the same as handing them the unit's money. Only admins may do it; a
// leader editing the roster must not be able to make themselves treasurer.
export function changesTreasurerAccess(
  before: { position?: string | null; email?: string | null } | null,
  after: { position?: string | null; email?: string | null },
): boolean {
  const afterPosition = after.position === undefined ? before?.position : after.position;
  const wasTreasurer = positionHasScope(before?.position, SCOPES.TREASURER);
  const isTreasurer = positionHasScope(afterPosition, SCOPES.TREASURER);
  if (!wasTreasurer && !isTreasurer) return false;
  if (!before) return isTreasurer;
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  const positionChanged = norm(before.position) !== norm(afterPosition);
  const emailChanged = after.email !== undefined && norm(before.email) !== norm(after.email);
  return positionChanged || emailChanged;
}

export const TREASURER_CHANGE_FORBIDDEN =
  "Only an admin can give someone a treasurer position or change a treasurer's email.";
