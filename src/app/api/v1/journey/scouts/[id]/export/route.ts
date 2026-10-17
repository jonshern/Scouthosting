// GET /api/v1/journey/scouts/[id]/export?format=json|xlsx|zip — a copy
// of the scout's whole trail to keep: the trail file (json), a
// spreadsheet (xlsx), or both plus every photo (zip). Import it back
// with POST /api/v1/journey/import. See src/lib/journey/trail-file.ts.

import { z } from "zod";
import { parseId, readQuery, v1Route } from "@/lib/api/v1";
import { downloadResponse, trailDownload } from "@/lib/journey/trail-file";

export const runtime = "nodejs";

const Query = z.object({ format: z.enum(["json", "xlsx", "zip"]).default("json") });

export const GET = v1Route<{ id: string }>(
  async (req, { user, params }) => {
    const { format } = readQuery(req, Query);
    return downloadResponse(await trailDownload(user, parseId(params.id), format));
  },
  { limits: [{ bucket: "journey-export", limit: 60, windowMs: 60 * 60_000 }] },
);
