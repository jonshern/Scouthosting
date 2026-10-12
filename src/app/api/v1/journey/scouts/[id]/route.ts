// GET    /api/v1/journey/scouts/[id] — one scout's trail: { scout: {
//        id, name, linked, path, custom, progress, troop } }. progress
//        maps a step or item key to the day it was checked (or true).
//        troop, when the scout is linked to a troop roster entry this
//        account is a parent of, carries that troop's sign-offs.
// PATCH  /api/v1/journey/scouts/[id] — body { name?, path?, custom?,
//        memberId? } (memberId null unlinks).
// DELETE /api/v1/journey/scouts/[id] — removes the scout and its trail.
//
// Only the account that added the scout sees it; anyone else gets 404.

import { LIMITS, json, parseId, readJson, v1Route } from "@/lib/api/v1";
import { PatchScoutBody } from "@/lib/journey/schema";
import { deleteScout, getScout, updateScout } from "@/lib/journey/store";

export const runtime = "nodejs";

export const GET = v1Route<{ id: string }>(async (_req, { user, params }) =>
  json({ scout: await getScout(user, parseId(params.id)) }),
);

export const PATCH = v1Route<{ id: string }>(
  async (req, { user, params }) => {
    const id = parseId(params.id);
    const body = await readJson(req, PatchScoutBody);
    return json({ scout: await updateScout(user, id, body) });
  },
  { limits: [LIMITS.journey] },
);

export const DELETE = v1Route<{ id: string }>(
  async (_req, { user, params }) => {
    await deleteScout(user, parseId(params.id));
    return json({ ok: true });
  },
  { limits: [LIMITS.journey] },
);
