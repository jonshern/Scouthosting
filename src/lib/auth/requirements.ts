// Account requirements a signed-in user must meet before using parts of
// Compass:
//
//   - Adult confirmation. Every account belongs to an adult (scouts reach
//     Compass through a parent), so a new sign-up confirms they are 18 or
//     older. Password sign-ups tick a box on the form; Google/Apple
//     sign-ups are asked on /account/confirm-adult before going further.
//
//   - Two-step sign-in for admins and organizers. Anyone who can run a
//     unit (leader or admin in any org, or a super-admin) must turn on
//     two-step sign-in before the admin pages or the mobile app work for
//     them. Enforced when NODE_ENV=production, like the SSO rule in
//     ./policy.ts, with the same kind of escape hatch for staging/QA:
//     ALLOW_ADMIN_WITHOUT_MFA=1. Never set it in real production.

import { prisma } from "@/lib/db";

export const CONFIRM_ADULT_PAGE = "/account/confirm-adult";
export const MFA_SETUP_PAGE = "/account/security?required=1";

export function mfaRequiredForOrganizers(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  if (process.env.ALLOW_ADMIN_WITHOUT_MFA === "1") return false;
  return true;
}

export type AccountStanding = {
  adultConfirmed: boolean;
  organizer: boolean;
  mfaEnrolled: boolean;
};

export async function accountStanding(userId: string): Promise<AccountStanding> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      adultAttestedAt: true,
      isSuperAdmin: true,
      totpEnrolledAt: true,
      memberships: {
        where: { role: { in: ["leader", "admin"] } },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!u) return { adultConfirmed: false, organizer: false, mfaEnrolled: false };
  return {
    adultConfirmed: !!u.adultAttestedAt,
    organizer: u.isSuperAdmin || u.memberships.length > 0,
    mfaEnrolled: !!u.totpEnrolledAt,
  };
}

// Where to send the user before they may continue, or null if they're
// clear. `organizerSurface` is true for admin pages and the mobile app.
export function requirementRedirect(
  s: AccountStanding,
  { organizerSurface }: { organizerSurface: boolean },
): string | null {
  if (!s.adultConfirmed) return CONFIRM_ADULT_PAGE;
  if (organizerSurface && s.organizer && !s.mfaEnrolled && mfaRequiredForOrganizers()) {
    return MFA_SETUP_PAGE;
  }
  return null;
}

// True when this user may not switch two-step sign-in off.
export function mfaLocked(s: AccountStanding): boolean {
  return s.organizer && mfaRequiredForOrganizers();
}

export function withNext(path: string, next: string | null | undefined): string {
  if (!next) return path;
  return `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}`;
}
