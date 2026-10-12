// GET  /api/v1/events/:id/channels — the event's chat channels. Org
//      members see the ones they're in; leaders/admins see all.
// POST /api/v1/events/:id/channels — create (or find) the channel for
//      an audience and sync its members (leaders/admins).
//      Body: { audience: "staff" | "station" | "families", slotId? }
//      (slotId required for station).

import { json, readJson, v1Route, LEADER_ROLES } from "@/lib/api/v1";
import { loadEventForUser } from "@/lib/api/v1-events";
import { CreateChannelSchema, createEventChannel, listEventChannels } from "@/lib/events/messaging";

export const runtime = "nodejs";

export const GET = v1Route<{ id: string }>(async (_req, { user, params }) => {
  const { event, access } = await loadEventForUser(params.id, user.id);
  const channels = await listEventChannels(event.id, {
    userId: user.id,
    isLeader: LEADER_ROLES.includes(access.role),
  });
  return json({ channels });
});

export const POST = v1Route<{ id: string }>(async (req, { user, params }) => {
  const { event } = await loadEventForUser(params.id, user.id, { leader: true, write: true });
  const input = await readJson(req, CreateChannelSchema);
  return json({ channel: await createEventChannel(event, input) });
});
