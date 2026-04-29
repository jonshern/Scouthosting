// Audit log helper. Records who did what against which entity. Best
// effort — failures are logged but never propagate to the caller, so
// a transient DB blip doesn't break the actual edit.
//
// userDisplay snapshots the actor's name at write time so log lines
// stay readable after a leader rotates out of the org.

import { prisma } from "./db.js";

export async function recordAudit({ org, user, entityType, entityId, action, summary }) {
  if (!org?.id || !entityType || !action) return;
  try {
    await prisma.auditLog.create({
      data: {
        orgId: org.id,
        userId: user?.id || null,
        userDisplay: user?.displayName || null,
        entityType,
        entityId: entityId || null,
        action,
        summary: summary ? String(summary).slice(0, 500) : null,
      },
    });
  } catch (e) {
    console.warn(`[audit] failed to record ${action} on ${entityType}: ${e.message}`);
  }
}
