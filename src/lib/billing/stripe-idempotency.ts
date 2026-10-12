// Apply a Stripe webhook's effect exactly once.
//
// Stripe retries deliveries, can deliver the same event twice at once,
// and reports one payment as several events (checkout.session.completed
// and payment_intent.succeeded both carry the treasury metadata). A
// "have we seen this?" read followed by writes lets two concurrent
// deliveries both see nothing and both post.
//
// applyStripeOnce() inserts a StripeWebhookReceipt row keyed on what is
// being applied, then runs the caller's writes in the SAME transaction:
//   - a second delivery's insert waits on the first's row lock, then
//     fails the primary key once the first commits → { duplicate: true }
//   - if the writes throw, the receipt rolls back with them, so Stripe's
//     retry applies the effect cleanly instead of finding it "seen"
//
// Pick the key for the effect, not the delivery: `stripeKey("treasury",
// paymentIntentId)` for a payment that arrives as two events,
// `stripeKey("event", event.id)` when each event is its own effect
// (subscription updates).

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type StripeTx = Prisma.TransactionClient;

export function stripeKey(scope: string, id: string): string {
  return `${scope}:${id}`;
}

class DuplicateReceipt extends Error {}

export async function applyStripeOnce<T>(
  args: { key: string; eventId: string; eventType: string },
  apply: (tx: StripeTx) => Promise<T>,
): Promise<{ duplicate: true } | { duplicate: false; result: T }> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      try {
        await tx.stripeWebhookReceipt.create({
          data: { key: args.key, eventId: args.eventId, eventType: args.eventType },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new DuplicateReceipt();
        }
        throw err;
      }
      return apply(tx);
    });
    return { duplicate: false, result };
  } catch (err) {
    if (err instanceof DuplicateReceipt) return { duplicate: true };
    throw err;
  }
}
