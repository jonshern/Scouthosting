// Event capacity for RSVPs. An event's `capacity` is a headcount: each
// "yes" RSVP takes one spot plus its guests. Every RSVP path (the web
// form, the emailed link, the v1 API) checks here inside the same
// transaction as its write, after locking the event row, so two
// families racing for the last spot can't both get it.

import type { Prisma } from "@prisma/client";

type Tx = Pick<Prisma.TransactionClient, "$queryRaw" | "event" | "rsvp">;

export class EventFullError extends Error {
  constructor(readonly spotsLeft: number) {
    super("EVENT_FULL");
    this.name = "EventFullError";
  }
}

/**
 * Throws EventFullError when a "yes" with `guests` would take the event
 * past its capacity. An RSVP that doesn't grow (switching to no or
 * maybe, fewer guests, a notes edit) always goes through, even on an
 * event that is already over capacity because a leader lowered it.
 */
export async function assertRsvpFits(
  tx: Tx,
  args: { eventId: string; existingId: string | null; response: string; guests: number },
): Promise<void> {
  if (args.response !== "yes") return;
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${args.eventId} FOR NO KEY UPDATE`;
  const event = await tx.event.findUnique({ where: { id: args.eventId }, select: { capacity: true } });
  const capacity = event?.capacity;
  if (capacity == null || capacity <= 0) return;

  const yes = await tx.rsvp.findMany({
    where: { eventId: args.eventId, response: "yes" },
    select: { id: true, guests: true },
  });
  let others = 0;
  let mine = 0;
  for (const r of yes) {
    if (r.id === args.existingId) mine = 1 + r.guests;
    else others += 1 + r.guests;
  }
  const want = 1 + args.guests;
  if (want <= mine) return;
  if (others + want > capacity) throw new EventFullError(Math.max(0, capacity - others));
}

export function fullMessage(err: EventFullError): string {
  if (err.spotsLeft === 0) return "Sorry, this event is full.";
  const spots = err.spotsLeft === 1 ? "1 spot" : `${err.spotsLeft} spots`;
  return `Only ${spots} left. Bring fewer guests, or RSVP maybe and talk to a leader.`;
}
