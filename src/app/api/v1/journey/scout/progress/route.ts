// POST /api/v1/journey/scout/progress — body { changes: [{ key, done,
// on? }] } from the scout's own device. Same rules as the parent's
// route; the steps are recorded as checked by the scout (checkedBy).

import { LIMITS, json, readJson, v1PublicRoute } from "@/lib/api/v1";
import { requireScoutDevice } from "@/lib/journey/devices";
import { ProgressBody } from "@/lib/journey/schema";
import { applyProgressAsScout } from "@/lib/journey/store";

export const runtime = "nodejs";

export const POST = v1PublicRoute(
  async (req) => {
    const { scoutId } = await requireScoutDevice(req);
    const { changes } = await readJson(req, ProgressBody);
    return json({ scout: await applyProgressAsScout(scoutId, changes) });
  },
  { limits: [LIMITS.journey] },
);
