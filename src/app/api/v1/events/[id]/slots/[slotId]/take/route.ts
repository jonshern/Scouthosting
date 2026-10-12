// POST /api/v1/events/[id]/slots/[slotId]/take — claim a sign-up slot
// as the signed-in user. Body: { notes? }. Joins the waitlist when the
// slot is full and allows one; 409 slot_full when it doesn't. Taking a
// slot you already hold returns your current seat (idempotent).

import { z } from "zod";
import { prisma } from "@/lib/db";
import { reconcileEventChannels } from "@/lib/chat";
import { ApiError, LIMITS, json, readJson, v1Route } from "@/lib/api/v1";
import { loadSlotForMember } from "@/lib/api/v1-slots";
import { SlotFullError, claimSlot } from "@/lib/slots";

export const runtime = "nodejs";

const Body = z.object({
  notes: z.string().trim().max(200, "notes_too_long").optional().nullable(),
});

export const POST = v1Route<{ id: string; slotId: string }>(
  async (req, { user, params }) => {
    const { event, slot } = await loadSlotForMember(params, user.id);
    const input = await readJson(req, Body);
    try {
      const r = await prisma.$transaction((tx) =>
        claimSlot(tx, {
          orgId: event.orgId,
          slotId: slot.id,
          userId: user.id,
          name: user.displayName,
          email: user.email.trim().toLowerCase(),
          notes: input.notes || null,
          idempotent: true,
        }),
      );
      await reconcileEventChannels(event.id, { prismaClient: prisma });
      return json({ ok: true, waitlisted: r.waitlisted });
    } catch (err) {
      if (err instanceof SlotFullError) throw new ApiError(409, "slot_full");
      throw err;
    }
  },
  { limits: [LIMITS.slot] },
);
