// The scout's own device (Authorization: Bearer lantern_scout_…).
// GET    /api/v1/journey/scout — their trail, same shape as the parent's
//        GET /api/v1/journey/scouts/[id].
// DELETE /api/v1/journey/scout — sign this device out (revokes its token).

import { json, v1PublicRoute } from "@/lib/api/v1";
import { requireScoutDevice, revokeDevice } from "@/lib/journey/devices";
import { getScoutAsScout } from "@/lib/journey/store";

export const runtime = "nodejs";

export const GET = v1PublicRoute(async (req) => {
  const { scoutId } = await requireScoutDevice(req);
  return json({ scout: await getScoutAsScout(scoutId) });
});

export const DELETE = v1PublicRoute(async (req) => {
  const { scoutId, deviceId } = await requireScoutDevice(req);
  await revokeDevice(scoutId, deviceId);
  return json({ ok: true });
});
