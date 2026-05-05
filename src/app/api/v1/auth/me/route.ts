// GET /api/v1/auth/me — bearer-authenticated. Returns the user's
// identity + the orgs they belong to. Mirrors the Express version
// the production Expo client expects.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withBearerAuth } from "@/lib/auth/api-bearer";

export const runtime = "nodejs";

export const GET = withBearerAuth(async (_req, { user }) => {
  const memberships = await prisma.orgMembership.findMany({
    where: { userId: user.id },
    select: {
      role: true,
      org: { select: { id: true, slug: true, displayName: true, plan: true, isDemo: true } },
    },
  });
  return NextResponse.json({
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
  });
});
