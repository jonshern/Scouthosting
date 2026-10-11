// GET /api/v1/channels/[id] — channel detail + first page of messages.

import { json, v1Route } from "@/lib/api/v1";
import { loadMessagePage, loadReadableChannel } from "@/lib/api/v1-chat";

export const runtime = "nodejs";

export const GET = v1Route<{ id: string }>(async (_req, { user, params }) => {
  const channel = await loadReadableChannel(params.id, user.id);
  const page = await loadMessagePage(channel.id);

  return json({
    channel: {
      id: channel.id,
      orgId: channel.orgId,
      kind: channel.kind,
      name: channel.name,
      patrolName: channel.patrolName,
      eventId: channel.eventId,
      isSuspended: channel.isSuspended,
      suspendedReason: channel.suspendedReason,
      archivedAt: channel.archivedAt,
      isLeaderOnly: channel.kind === "leaders",
      canPost: !channel.isSuspended && !channel.archivedAt,
      youAreChannelOwner: channel.members[0]?.role === "owner",
      updatedAt: channel.updatedAt,
    },
    ...page,
  });
});
