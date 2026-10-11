// PATCH  /api/v1/events/:id/staff/:staffId — change role, station,
//        status or notes (leaders/admins). Body: { role?, slotId?,
//        status?, notes? }; slotId null clears the station.
// DELETE /api/v1/events/:id/staff/:staffId — remove the staffer.

import { json, parseId, readJson, v1Route } from "@/lib/api/v1";
import { loadEventForUser } from "@/lib/api/v1-events";
import { PatchStaffSchema, removeStaff, updateStaff } from "@/lib/events/staff";

export const runtime = "nodejs";

type P = { id: string; staffId: string };

export const PATCH = v1Route<P>(async (req, { user, params }) => {
  const { event } = await loadEventForUser(params.id, user.id, { leader: true, write: true });
  const staffId = parseId(params.staffId);
  const patch = await readJson(req, PatchStaffSchema);
  return json({ staff: await updateStaff(event, staffId, patch, { actor: user }) });
});

export const DELETE = v1Route<P>(async (_req, { user, params }) => {
  const { event } = await loadEventForUser(params.id, user.id, { leader: true, write: true });
  await removeStaff(event, parseId(params.staffId), { actor: user });
  return json({ ok: true });
});
