// Shared lookup for the v1 slot take/release routes.

import { prisma } from "@/lib/db";
import { notFound, parseId, requireOrgAccessForResource } from "@/lib/api/v1";

/**
 * Resolve the event and slot from path params and require the caller
 * to be a member of the event's org (writes refused while suspended).
 * A slot that doesn't belong to the event is a 404 like any other.
 */
export async function loadSlotForMember(params: { id: string; slotId: string }, userId: string) {
  const eventId = parseId(params.id);
  const slotId = parseId(params.slotId);
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, orgId: true } });
  if (!event) throw notFound();
  await requireOrgAccessForResource(event.orgId, userId, { write: true });
  const slot = await prisma.signupSlot.findFirst({
    where: { id: slotId, eventId: event.id, orgId: event.orgId },
    select: { id: true },
  });
  if (!slot) throw notFound();
  return { event, slot };
}
