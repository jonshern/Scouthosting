// Access check for every page under /o/[slug]/admin.
//
// The admin layout used to be the only check, but Next skips a layout
// on partial (RSC) navigations when the router state says it's already
// mounted, and that state comes from the client. A signed-out request
// with hand-made RSC headers rendered admin pages with no check at all.
// So every admin page calls requireAdminPage (and treasury pages
// requireTreasuryPage) itself; tests/admin-guard.test.ts fails when a
// page under admin/ doesn't.
//
// Cached per request, so the layout and the page share one lookup.

import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { Org } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession, type SessionUser } from "@/lib/auth/session";
import { isLeaderRole, roleInOrg, type Role } from "@/lib/auth/role";
import { accountStanding, requirementRedirect, withNext } from "@/lib/auth/requirements";
import { canManageTreasury } from "@/lib/auth/treasury-access";

export type AdminAccess =
  | { ok: true; org: Org; user: SessionUser; role: Role | null }
  | { ok: false; org: Org; user: SessionUser; role: Role | null };

/**
 * The org, the signed-in user and whether they may use the admin area
 * (a leader or admin of the org, or a super-admin). Redirects to sign-in
 * when signed out and to two-step setup when an organizer lacks it;
 * 404 when the org doesn't exist.
 */
export const adminAccess = cache(async (slug: string): Promise<AdminAccess> => {
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin`);
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) return { ok: false, org, user, role };
  // Admins and organizers must have two-step sign-in on (lib/auth/requirements.ts).
  const gate = requirementRedirect(await accountStanding(user.id), { organizerSurface: true });
  if (gate) redirect(withNext(gate, `/o/${slug}/admin`));
  return { ok: true, org, user, role };
});

/** For admin pages: the org and user, or 404 for anyone else. */
export async function requireAdminPage(slug: string) {
  const a = await adminAccess(slug);
  if (!a.ok) notFound();
  return { org: a.org, user: a.user, role: a.role };
}

/** For treasury pages: admins and the unit's treasurer only, else 404. */
export async function requireTreasuryPage(slug: string) {
  const a = await requireAdminPage(slug);
  if (!(await canManageTreasury(a.user, a.org.id))) notFound();
  return a;
}
