// DELETE /api/v1/journey/scouts/[id]/devices/[deviceId] — the parent
// turns off one of the scout's devices; its token stops working.

import { LIMITS, json, parseId, v1Route } from "@/lib/api/v1";
import { revokeDevice } from "@/lib/journey/devices";
import { requireOwned } from "@/lib/journey/store";

export const runtime = "nodejs";

export const DELETE = v1Route<{ id: string; deviceId: string }>(
  async (_req, { user, params }) => {
    const id = parseId(params.id);
    await requireOwned(user, id);
    await revokeDevice(id, parseId(params.deviceId));
    return json({ ok: true });
  },
  { limits: [LIMITS.journey] },
);
