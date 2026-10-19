// GET /api/v1/auth/me — bearer-authenticated. Returns the user's
// identity + the orgs they belong to. Mirrors the Express version
// the production Expo client expects. `entitlements` says what the
// account gets free on its own, outside any unit's subscription
// (lib/billing/entitlements.ts); Waypoint reads it.

import { prisma } from "@/lib/db";
import { json, v1Route } from "@/lib/api/v1";
import { entitlementsFor } from "@/lib/billing/entitlements";
import { isYouthUser } from "@/lib/counselor/access";

export const runtime = "nodejs";

export const GET = v1Route(async (_req, { user }) => {
  const [memberships, isYouth] = await Promise.all([
    prisma.orgMembership.findMany({
      where: { userId: user.id },
      select: {
        role: true,
        org: { select: { id: true, slug: true, displayName: true } },
      },
    }),
    isYouthUser(user),
  ]);
  return json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    },
    // Shape matches mobile/src/api/types.ts MeDto.
    memberships: memberships.map((m) => ({
      orgId: m.org.id,
      orgName: m.org.displayName,
      orgSlug: m.org.slug,
      role: m.role,
    })),
    entitlements: entitlementsFor({ isYouth }),
  });
});
