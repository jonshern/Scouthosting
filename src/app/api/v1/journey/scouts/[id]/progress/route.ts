// POST /api/v1/journey/scouts/[id]/progress — body { changes: [{ key,
// done, on? }] }: checks (done: true, on: "2026-10-11") or unchecks
// steps on the scout's trail. Applied all or nothing; the last change
// per key wins. Returns the whole trail, like GET on the scout.
//
// This is the family's own record. Troop sign-offs live in
// RequirementProgress (scouts/[id]/progress) and are never written here.

import { LIMITS, json, parseId, readJson, v1Route } from "@/lib/api/v1";
import { ProgressBody } from "@/lib/journey/schema";
import { applyProgress } from "@/lib/journey/store";
import { recordAction } from "@/lib/usage/collect";

export const runtime = "nodejs";

export const POST = v1Route<{ id: string }>(
  async (req, { user, params }) => {
    const id = parseId(params.id);
    const { changes } = await readJson(req, ProgressBody);
    const scout = await applyProgress(user, id, changes);
    const checked = changes.filter((c) => c.done).length;
    if (checked) recordAction("step_checked", { product: "lantern", userId: user.id, scoutId: id, props: { steps: checked, by: "adult" } });
    return json({ scout });
  },
  { limits: [LIMITS.journey] },
);
