// Sign-up slot capacity + waitlist rules, shared by the web server
// actions. Each function runs inside a caller-supplied transaction and
// starts by locking the slot row (SELECT … FOR UPDATE), so concurrent
// claims and releases on the same slot queue up instead of both
// reading a stale active count. Without the lock, Postgres' default
// READ COMMITTED isolation lets two claims for the last seat both see
// "1 left" and both insert.

import type { Prisma } from "@prisma/client";

type Tx = Pick<Prisma.TransactionClient, "$queryRaw" | "signupSlot" | "slotAssignment">;

export class SlotFullError extends Error {
  code = "FULL" as const;
  constructor() {
    super("FULL");
  }
}

async function lockSlot(tx: Tx, slotId: string) {
  await tx.$queryRaw`SELECT id FROM "SignupSlot" WHERE id = ${slotId} FOR UPDATE`;
  const slot = await tx.signupSlot.findUnique({
    where: { id: slotId },
    select: { id: true, capacity: true, allowWaitlist: true },
  });
  if (!slot) throw new Error(`slot ${slotId} not found`);
  return slot;
}

/**
 * Claim a seat. Joins the waitlist when full (if the slot allows it),
 * otherwise throws SlotFullError.
 *
 * `scoutName` names the scout a guardian is holding the seat for
 * (public sign-ups); "" / omitted means the signer is the attendee.
 *
 * With `idempotent`, a repeat claim by the same person (same userId,
 * or same guest email + scoutName) returns the existing seat instead
 * of tripping the unique constraint. A signed-in user also adopts an
 * earlier guest claim made with their email. The lookup runs after
 * the row lock, so duplicate requests racing each other serialize.
 */
export async function claimSlot(
  tx: Tx,
  args: {
    orgId: string;
    slotId: string;
    userId: string | null;
    name: string;
    email: string | null;
    notes: string | null;
    scoutName?: string;
    phone?: string | null;
    idempotent?: boolean;
  },
): Promise<{ waitlisted: boolean; existing?: boolean }> {
  const slot = await lockSlot(tx, args.slotId);
  const scoutName = args.scoutName ?? "";
  if (args.idempotent) {
    const mine = args.userId
      ? await tx.slotAssignment.findFirst({ where: { slotId: slot.id, userId: args.userId } })
      : null;
    if (mine) return { waitlisted: mine.waitlisted, existing: true };
    const guest = args.email
      ? await tx.slotAssignment.findFirst({
          where: { slotId: slot.id, userId: null, email: args.email, scoutName },
        })
      : null;
    if (guest) {
      if (args.userId) {
        await tx.slotAssignment.update({ where: { id: guest.id }, data: { userId: args.userId } });
      }
      return { waitlisted: guest.waitlisted, existing: true };
    }
  }
  const active = await tx.slotAssignment.count({
    where: { slotId: slot.id, waitlisted: false },
  });
  let waitlisted = false;
  if (active >= slot.capacity) {
    if (!slot.allowWaitlist) throw new SlotFullError();
    waitlisted = true;
  }
  await tx.slotAssignment.create({
    data: {
      orgId: args.orgId,
      slotId: slot.id,
      userId: args.userId,
      name: args.name,
      email: args.email,
      notes: args.notes,
      scoutName,
      phone: args.phone ?? null,
      waitlisted,
    },
  });
  return { waitlisted };
}

/**
 * Release one assignment and promote waitlisters, oldest first, until
 * the slot is full again. Promoting "until full" (not just one) also
 * catches up when a leader raised the capacity since the last release.
 *
 * `who` identifies the assignment: signed-in users by userId; guests
 * by email, and a guest can only release a guest claim (never one a
 * signed-in user made, even if the email matches).
 */
export async function releaseSlot(
  tx: Tx,
  args: {
    slotId: string;
    who: { userId: string } | { guestEmail: string; scoutName?: string };
  },
): Promise<{ released: boolean; promotedIds: string[] }> {
  const slot = await lockSlot(tx, args.slotId);
  const where =
    "userId" in args.who
      ? { slotId: slot.id, userId: args.who.userId }
      : {
          slotId: slot.id,
          userId: null,
          email: args.who.guestEmail,
          scoutName: args.who.scoutName ?? "",
        };
  const target = await tx.slotAssignment.findFirst({ where });
  if (!target) return { released: false, promotedIds: [] };
  await tx.slotAssignment.delete({ where: { id: target.id } });

  const promotedIds = await promote(tx, slot);
  return { released: true, promotedIds };
}

/**
 * Move waitlisters into open seats after a leader raised a slot's
 * capacity (or re-imported the event file with bigger slots). Returns
 * the promoted assignment ids.
 */
export async function fillFromWaitlist(tx: Tx, slotId: string): Promise<string[]> {
  const slot = await lockSlot(tx, slotId);
  return promote(tx, slot);
}

async function promote(tx: Tx, slot: { id: string; capacity: number }): Promise<string[]> {
  const active = await tx.slotAssignment.count({
    where: { slotId: slot.id, waitlisted: false },
  });
  const open = slot.capacity - active;
  if (open <= 0) return [];

  const nextUp = await tx.slotAssignment.findMany({
    where: { slotId: slot.id, waitlisted: true },
    orderBy: { createdAt: "asc" },
    take: open,
    select: { id: true },
  });
  const promotedIds = nextUp.map((a) => a.id);
  if (promotedIds.length) {
    await tx.slotAssignment.updateMany({
      where: { id: { in: promotedIds } },
      data: { waitlisted: false },
    });
  }
  return promotedIds;
}
