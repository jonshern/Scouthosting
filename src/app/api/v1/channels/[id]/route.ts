// GET /api/v1/channels/[id] — channel detail + first page of messages.

import { json, v1Route } from "@/lib/api/v1";
import { dmCounterparts, loadMessagePage, loadReadableChannel } from "@/lib/api/v1-chat";

export const runtime = "nodejs";

export const GET = v1Route<{ id: string }>(async (_req, { user, params }) => {
  const channel = await loadReadableChannel(params.id, user.id);
  const [page, dms] = await Promise.all([
    loadMessagePage(channel.id, undefined, user.id),
    dmCounterparts([channel], user.id),
  ]);

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
      dmCounterpartyName: dms.get(channel.id)?.displayName ?? null,
      dmCounterpartyUserId: dms.get(channel.id)?.userId ?? null,
      updatedAt: channel.updatedAt,
    },
    ...page,
  });
});
