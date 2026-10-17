// GET /api/v1/journey/scout/entries/[entryId]/photo — a proof photo, for
// the scout's own device.

import { parseId, v1PublicRoute } from "@/lib/api/v1";
import { requireScoutDevice } from "@/lib/journey/devices";
import { deviceScoutRef, readPhoto } from "@/lib/journey/entries";
import { photoResponse } from "@/lib/journey/photo-upload";

export const runtime = "nodejs";

export const GET = v1PublicRoute<{ entryId: string }>(async (req, { params }) => {
  const ref = await deviceScoutRef((await requireScoutDevice(req)).scoutId);
  return photoResponse(await readPhoto(ref, parseId(params.entryId)));
});
