// GET  /api/v1/journey/scout/entries[?key=...] and
// POST /api/v1/journey/scout/entries — the same as the parent's
// scouts/[id]/entries routes, from the scout's own device (a
// lantern_scout_ token). Entries made here are recorded as by "scout".

import { LIMITS, json, readJson, readQuery, v1PublicRoute } from "@/lib/api/v1";
import { requireScoutDevice } from "@/lib/journey/devices";
import { EntriesBody, EntriesQuery } from "@/lib/journey/schema";
import { applyEntries, deviceScoutRef, listEntries } from "@/lib/journey/entries";

export const runtime = "nodejs";

export const GET = v1PublicRoute(async (req) => {
  const ref = await deviceScoutRef((await requireScoutDevice(req)).scoutId);
  const { key } = readQuery(req, EntriesQuery);
  return json({ entries: await listEntries(ref, key) });
});

export const POST = v1PublicRoute(
  async (req) => {
    const ref = await deviceScoutRef((await requireScoutDevice(req)).scoutId);
    const body = await readJson(req, EntriesBody);
    return json({ entries: await applyEntries(ref, { userId: null, role: "scout" }, body) });
  },
  { limits: [LIMITS.journey] },
);
