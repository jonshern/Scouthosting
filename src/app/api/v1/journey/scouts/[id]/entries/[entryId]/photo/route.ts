// GET /api/v1/journey/scouts/[id]/entries/[entryId]/photo — the photo on
// a proof entry (entryId is its clientId), decrypted, never cached.

import { parseId, v1Route } from "@/lib/api/v1";
import { ownedScoutRef, readPhoto } from "@/lib/journey/entries";
import { photoResponse } from "@/lib/journey/photo-upload";

export const runtime = "nodejs";

export const GET = v1Route<{ id: string; entryId: string }>(async (_req, { user, params }) => {
  const ref = await ownedScoutRef(user, parseId(params.id));
  return photoResponse(await readPhoto(ref, parseId(params.entryId)));
});
