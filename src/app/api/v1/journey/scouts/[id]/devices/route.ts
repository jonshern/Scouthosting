// GET /api/v1/journey/scouts/[id]/devices — the scout's own devices
// that can open their trail: [{ id, label, createdAt, lastUsedAt }].

import { json, parseId, v1Route } from "@/lib/api/v1";
import { listDevices } from "@/lib/journey/devices";
import { requireOwned } from "@/lib/journey/store";

export const runtime = "nodejs";

export const GET = v1Route<{ id: string }>(async (_req, { user, params }) => {
  const id = parseId(params.id);
  await requireOwned(user, id);
  return json({ devices: await listDevices(id) });
});
