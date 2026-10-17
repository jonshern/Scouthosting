// POST /api/v1/journey/scouts/[id]/pair-code — the parent makes a
// one-time code ({ code: "ABCD-EFGH", expiresAt }) to set up the
// scout's own device in Lantern. Valid 15 minutes, single use; a new
// code retires the old one. See src/lib/journey/devices.ts.

import { LIMITS, json, parseId, v1Route } from "@/lib/api/v1";
import { makePairCode } from "@/lib/journey/devices";
import { requireOwned } from "@/lib/journey/store";

export const runtime = "nodejs";

export const POST = v1Route<{ id: string }>(
  async (_req, { user, params }) => {
    const id = parseId(params.id);
    await requireOwned(user, id);
    return json(await makePairCode(id), { status: 201 });
  },
  { limits: [LIMITS.journey] },
);
