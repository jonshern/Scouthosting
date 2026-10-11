// POST /api/v1/events/[id]/slots/[slotId]/release — give up the signed-in
// user's seat (or waitlist spot) and promote waitlisters oldest-first,
// in one locked transaction (lib/slots). Idempotent: releasing a slot
// you don't hold is still { ok: true }, with released: false.

import { prisma } from "@/lib/db";
import { reconcileEventChannels } from "@/lib/chat";
import { LIMITS, json, v1Route } from "@/lib/api/v1";
import { loadSlotForMember } from "@/lib/api/v1-slots";
import { releaseSlot } from "@/lib/slots";

export const runtime = "nodejs";

export const POST = v1Route<{ id: string; slotId: string }>(
  async (_req, { user, params }) => {
    const { event, slot } = await loadSlotForMember(params, user.id);
    const r = await prisma.$transaction((tx) =>
      releaseSlot(tx, { slotId: slot.id, who: { userId: user.id } }),
    );
    await reconcileEventChannels(event.id, { prismaClient: prisma });
    return json({ ok: true, released: r.released });
  },
  { limits: [LIMITS.slot] },
);
