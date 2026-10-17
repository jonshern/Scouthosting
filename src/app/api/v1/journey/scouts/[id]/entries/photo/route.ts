// POST /api/v1/journey/scouts/[id]/entries/photo — multipart with a
// "photo" file part and clientId, key, day?, text? fields: adds a photo
// as proof on a requirement. Encrypted before it reaches storage.
// Returns { entry }. Re-sending the same clientId keeps the first photo.

import { LIMITS, json, parseId, v1Route } from "@/lib/api/v1";
import { addPhotoEntry, ownedScoutRef } from "@/lib/journey/entries";
import { readPhotoUpload } from "@/lib/journey/photo-upload";

export const runtime = "nodejs";

export const POST = v1Route<{ id: string }>(
  async (req, { user, params }) => {
    const ref = await ownedScoutRef(user, parseId(params.id));
    const { fields, bytes, mimeType } = await readPhotoUpload(req);
    return json({ entry: await addPhotoEntry(ref, { userId: user.id, role: "parent" }, fields, bytes, mimeType) });
  },
  { limits: [LIMITS.journey] },
);
