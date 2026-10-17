// POST /api/v1/journey/scout/entries/photo — a proof photo from the
// scout's own device; same as scouts/[id]/entries/photo.

import { LIMITS, json, v1PublicRoute } from "@/lib/api/v1";
import { requireScoutDevice } from "@/lib/journey/devices";
import { addPhotoEntry, deviceScoutRef } from "@/lib/journey/entries";
import { readPhotoUpload } from "@/lib/journey/photo-upload";

export const runtime = "nodejs";

export const POST = v1PublicRoute(
  async (req) => {
    const ref = await deviceScoutRef((await requireScoutDevice(req)).scoutId);
    const { fields, bytes, mimeType } = await readPhotoUpload(req);
    return json({ entry: await addPhotoEntry(ref, { userId: null, role: "scout" }, fields, bytes, mimeType) });
  },
  { limits: [LIMITS.journey] },
);
