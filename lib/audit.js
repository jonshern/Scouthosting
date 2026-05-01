// Audit log helper. Records who did what against which entity. Best
// effort — failures are logged but never propagate to the caller, so
// a transient DB blip doesn't break the actual edit.
//
// userDisplay snapshots the actor's name at write time so log lines
// stay readable after a leader rotates out of the org.

import { prisma as defaultPrisma } from "./db.js";
import { logger } from "./log.js";

const log = logger.child("audit");

export async function recordAudit({
  org,
  user,
  entityType,
  entityId,
  action,
  summary,
  prismaClient = defaultPrisma,
}) {
  if (!org?.id || !entityType || !action) return;
  try {
    await prismaClient.auditLog.create({
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
    log.warn("failed to record audit row", { action, entityType, err: e });
  }
}
