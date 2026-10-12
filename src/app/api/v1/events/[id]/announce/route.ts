// POST /api/v1/events/:id/announce — email the event's staff, one
// station's staff, or its families (leaders/admins). Logged in
// MailLog + the audit log like the admin email composer.
// Body: { scope: "staff" | "station" | "families", slotId?, subject, body }.

import { LIMITS, json, readJson, v1Route } from "@/lib/api/v1";
import { loadEventForUser } from "@/lib/api/v1-events";
import { AnnounceSchema, announceToEvent } from "@/lib/events/messaging";

export const runtime = "nodejs";

export const POST = v1Route<{ id: string }>(
  async (req, { user, params }) => {
    const { event } = await loadEventForUser(params.id, user.id, { leader: true, write: true });
    const input = await readJson(req, AnnounceSchema);
    const r = await announceToEvent(event, input, user);
    return json({
      announcement: {
        mailLogId: r.mailLogId,
        status: r.status,
        recipientCount: r.recipientCount,
        deliveredCount: r.deliveredCount,
        failedCount: r.failedCount,
      },
    });
  },
  { limits: [LIMITS.announce] },
);
