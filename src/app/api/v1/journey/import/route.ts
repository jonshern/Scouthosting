// POST /api/v1/journey/import[?into=<scoutId>] — puts a saved trail file
// back on the account. The body is the file itself (the .json or .zip
// from the export, or Lantern's phone-only copy), or a form with a
// "file" part. Without `into` it becomes a new scout; with it, what the
// file has that the scout doesn't is added (nothing is unchecked or
// overwritten). Returns { scout, imported: { steps, entries, photos, skipped } }.

import { z } from "zod";
import { IdSchema, json, readQuery, v1Route } from "@/lib/api/v1";
import { importTrail, parseTrailUpload, readTrailUpload } from "@/lib/journey/trail-file";

export const runtime = "nodejs";

const Query = z.object({ into: IdSchema.optional() });

export const POST = v1Route(
  async (req, { user }) => {
    const { into } = readQuery(req, Query);
    const trail = parseTrailUpload(await readTrailUpload(req));
    return json(await importTrail(user, trail, into));
  },
  { limits: [{ bucket: "journey-import", limit: 20, windowMs: 60 * 60_000 }] },
);
