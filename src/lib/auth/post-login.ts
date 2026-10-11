// Compute where to land a freshly-authenticated user. Used by the
// password login + MFA flows + the SSO callbacks so they all behave
// the same way:
//
//   - 1 org, leader/admin → /o/<slug>/admin
//   - 1 org, scout/parent → /o/<slug>
//   - 2+ orgs            → /select-org
//   - 0 orgs             → /account/profile
//
// If `nextParam` is provided and looks like a same-origin path, it
// takes precedence — that's how /admin redirects to /login?next=…
// keep the original target.

import { prisma } from "@/lib/db";
import { isLeaderRole } from "@/lib/auth/role";

export function isSafeNextPath(next: string | null | undefined): boolean {
  if (!next) return false;
  // Same-origin only. Reject //evil.example, javascript:, full URLs, etc.
  // Browsers read "\" as "/", so "/\evil.example" is protocol-relative
  // too; control characters are stripped before parsing, so reject them.
  if (!next.startsWith("/") || next.startsWith("//")) return false;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return false;
  return true;
}

export async function postLoginRedirectUrl(
  userId: string,
  nextParam?: string | null,
): Promise<string> {
  if (isSafeNextPath(nextParam)) return nextParam!;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperAdmin: true },
  });
  // Super-admins land on the operator console even with no org
  // memberships — that's their daily-driver page.
  if (user?.isSuperAdmin) return "/super-admin";

  const memberships = await prisma.orgMembership.findMany({
    where: { userId },
    include: { org: { select: { slug: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (memberships.length === 0) return "/account/profile";

  if (memberships.length === 1) {
    const m = memberships[0]!;
    return isLeaderRole(m.role) ? `/o/${m.org.slug}/admin` : `/o/${m.org.slug}`;
  }

  return "/select-org";
}
