// Run a Stripe webhook event's handler at most once. Stripe redelivers
// events (on timeouts, retries, or two deliveries racing), so every
// webhook route wraps its handler here. The event id is claimed with an
// insert before the handler runs: a unique-key clash means another
// delivery already has it. If the handler throws, the claim is released
// so Stripe's next retry runs it again.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type OnceResult<T> = { duplicate: true } | { duplicate: false; result: T };

export async function withStripeEventOnce<T>(
  event: { id?: string; type?: string },
  source: string,
  fn: () => Promise<T>,
): Promise<OnceResult<T>> {
  // Without an id there's nothing to dedupe on; run it.
  if (!event.id) return { duplicate: false, result: await fn() };
  try {
    await prisma.stripeWebhookEvent.create({
      data: { id: event.id, source, type: event.type ?? "unknown" },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { duplicate: true };
    }
    throw err;
  }
  try {
    return { duplicate: false, result: await fn() };
  } catch (err) {
    await prisma.stripeWebhookEvent.delete({ where: { id: event.id } }).catch(() => {});
    throw err;
  }
}
