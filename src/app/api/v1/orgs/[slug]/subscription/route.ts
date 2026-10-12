// GET /api/v1/orgs/[id-or-slug]/subscription — the unit's trial and
// subscription state, for Waypoint and Lantern to show the same trial
// countdown and lock as Compass. Any member may read it; changing it
// happens in Compass's billing page (admin/billing) and Stripe.

import { prisma } from "@/lib/db";
import { json, requireOrgAccess, v1Route } from "@/lib/api/v1";
import { isConfigured } from "@/lib/billing/stripe";
import { billingSummary } from "@/lib/billing/trial";

export const runtime = "nodejs";

export const GET = v1Route<{ slug: string }>(async (_req, { user, params }) => {
  const { org } = await requireOrgAccess(params.slug, user.id);
  const row = await prisma.org.findUniqueOrThrow({
    where: { id: org.id },
    select: {
      subscriptionStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      stripeSubscriptionId: true,
      isDemo: true,
      suspendedAt: true,
      suspendedReason: true,
    },
  });
  const summary = billingSummary(row, { stripeConfigured: isConfigured() });
  return json({
    org: { id: org.id, slug: org.slug, displayName: org.displayName },
    subscription: summary,
  });
});
