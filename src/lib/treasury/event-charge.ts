// Settle an event's auto-charge based on the latest RSVP transition.
// Idempotent: a "yes" with an existing unreversed charge does
// nothing; a transition away from "yes" inserts the reversal.
//
// Cost-zero events are a no-op. Treasury must be provisioned for
// auto-charge to fire; otherwise we silently skip (provision is
// idempotent and on the leader's terms).

import { prisma } from "@/lib/db";
import { postTransaction, reverseTransaction } from "./posting";
import { requireSystemFund } from "./provision";
import { SCOUT_ACCOUNTS } from "./money";

export async function settleEventChargeForRsvp(args: {
  orgId: string;
  eventId: string;
  memberId: string | null;
  response: "yes" | "no" | "maybe";
}): Promise<void> {
  if (!args.memberId) return;

  const event = await prisma.event.findUnique({
    where: { id: args.eventId },
    select: { id: true, cost: true, title: true, orgId: true },
  });
  if (!event || event.orgId !== args.orgId) return;
  if (!event.cost || event.cost <= 0) return;

  // Look up the last open (unreversed) event-charge for this pair.
  const existing = await prisma.transaction.findFirst({
    where: {
      orgId: args.orgId,
      eventId: args.eventId,
      memberId: args.memberId,
      type: "event-charge",
      reversedBy: { none: {} },
    },
    orderBy: { postedAt: "desc" },
  });

  if (args.response === "yes") {
    if (existing) return; // already charged
    let fund;
    try {
      fund = await requireSystemFund(args.orgId, SCOUT_ACCOUNTS);
    } catch {
      return; // treasury not provisioned; skip silently
    }
    await postTransaction({
      orgId: args.orgId,
      fundId: fund.id,
      type: "event-charge",
      amountCents: -event.cost * 100,
      description: `Event charge: ${event.title}`,
      memberId: args.memberId,
      eventId: args.eventId,
    });
    return;
  }

  // Transition away from yes → reverse the open charge if any.
  if (existing) {
    await reverseTransaction({
      orgId: args.orgId,
      originalId: existing.id,
      description: `Auto-reversal: RSVP changed to ${args.response} for ${event.title}`,
    });
  }
}

/** Resolve a User → Member in this org by email, for the signed-in path. */
export async function memberForUserInOrg(args: {
  orgId: string;
  userEmail: string;
}): Promise<string | null> {
  const m = await prisma.member.findFirst({
    where: { orgId: args.orgId, email: args.userEmail.toLowerCase(), deletedAt: null },
    select: { id: true },
  });
  return m?.id ?? null;
}
