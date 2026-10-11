// GET  /api/v1/events/:id/staff — the event's staff (leaders/admins).
// POST /api/v1/events/:id/staff — add a staffer and email them a
//      private RSVP link. Body: { name, email, phone?, role, slotId?,
//      counselorId?, notes? }.

import { LIMITS, json, readJson, v1Route } from "@/lib/api/v1";
import { loadEventForUser } from "@/lib/api/v1-events";
import { AddStaffSchema, addStaff, listStaff } from "@/lib/events/staff";

export const runtime = "nodejs";

export const GET = v1Route<{ id: string }>(async (_req, { user, params }) => {
  const { event } = await loadEventForUser(params.id, user.id, { leader: true });
  return json({ staff: await listStaff(event.id) });
});

export const POST = v1Route<{ id: string }>(
  async (req, { user, params }) => {
    const { event } = await loadEventForUser(params.id, user.id, { leader: true, write: true });
    const input = await readJson(req, AddStaffSchema);
    const result = await addStaff(event, input, { actor: user });
    return json(result, { status: 201 });
  },
  { limits: [LIMITS.staffInvite] },
);
