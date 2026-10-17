// GET /api/v1/journey/scouts/[id]/entries/export[?key=rank:second-class] —
// the scout's logs and notes as a spreadsheet (CSV), one row per entry.

import { parseId, readQuery, v1Route } from "@/lib/api/v1";
import { EntriesQuery } from "@/lib/journey/schema";
import { entriesCsv, ownedScoutRef } from "@/lib/journey/entries";

export const runtime = "nodejs";

export const GET = v1Route<{ id: string }>(async (req, { user, params }) => {
  const ref = await ownedScoutRef(user, parseId(params.id));
  const { key } = readQuery(req, EntriesQuery);
  const { csv, name } = await entriesCsv(ref, key);
  const file = `${(name || "scout").replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}-log.csv`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${file}"`,
      "cache-control": "private, no-store",
    },
  });
});
