// GET  /api/v1/journey/scouts — the scouts this account follows in
//      Lantern: [{ id, name, linked, updatedAt }].
// POST /api/v1/journey/scouts — body { name, path?, custom?, progress? };
//      adds a scout (the app sends the trail already on the phone the
//      first time, so nothing checked off before sign-in is lost).
//
// Any signed-in adult may use these; no troop is needed. Scouts never
// sign in themselves. Data model: JourneyScout in prisma/schema.prisma.

import { LIMITS, json, readJson, v1Route } from "@/lib/api/v1";
import { CreateScoutBody } from "@/lib/journey/schema";
import { createScout, listScouts } from "@/lib/journey/store";

export const runtime = "nodejs";

export const GET = v1Route(async (_req, { user }) => json({ scouts: await listScouts(user) }));

export const POST = v1Route(
  async (req, { user }) => {
    const body = await readJson(req, CreateScoutBody);
    return json({ scout: await createScout(user, body) }, { status: 201 });
  },
  { limits: [LIMITS.journey] },
);
