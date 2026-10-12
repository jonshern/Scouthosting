// Settle an event's auto-charge based on the latest RSVP transition.
// Idempotent: a "yes" with an existing unreversed charge does
// nothing; a transition away from "yes" inserts the reversal.
//
// Cost-zero events are a no-op. Treasury must be provisioned for
// auto-charge to fire; otherwise we silently skip (provision is
// idempotent and on the leader's terms).

import { prisma } from "@/lib/db";
import { postWithin, reverseWithin, type Tx } from "./posting";
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

  let fund: { id: string } | null = null;
  try {
    fund = await requireSystemFund(args.orgId, SCOUT_ACCOUNTS);
  } catch {
    fund = null; // treasury not provisioned; charges are skipped
  }

  // One settlement at a time per (event, member): a double-tap "yes",
  // or "yes" then "no" in quick succession, would otherwise both read
  // "no charge yet" and post twice, or leave a charge behind a "no".
  // Inside the lock, settle to what the RSVP rows say now rather than
  // to this request's response, so whichever request settles last
  // leaves the ledger matching the final RSVP.
  await prisma.$transaction(async (stx) => {
    const tx = stx as unknown as Tx;
    await stx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`event-charge:${args.eventId}:${args.memberId}`}))`;
    const going =
      (await stx.rsvp.count({
        where: { eventId: args.eventId, memberId: args.memberId, response: "yes" },
      })) > 0;
    const existing = await stx.transaction.findFirst({
      where: {
        orgId: args.orgId,
        eventId: args.eventId,
        memberId: args.memberId,
        type: "event-charge",
        reversedBy: { none: {} },
      },
      orderBy: { postedAt: "desc" },
    });

    if (going) {
      if (existing || !fund) return; // already charged, or no treasury
      await postWithin(tx, {
        orgId: args.orgId,
        fundId: fund.id,
        type: "event-charge",
        amountCents: -event.cost! * 100,
        description: `Event charge: ${event.title}`,
        memberId: args.memberId,
        eventId: args.eventId,
      });
      return;
    }

    // No longer going → reverse the open charge, if any.
    if (existing) {
      await reverseWithin(tx, {
        orgId: args.orgId,
        originalId: existing.id,
        description: `Auto-reversal: RSVP changed to ${args.response} for ${event.title}`,
      });
    }
  });
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
