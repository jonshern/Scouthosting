// Deleting an event cascades its permission slips. Keep a trace that
// each signed slip existed (event, signing time) without the parent's
// name, email or IP, matching what the retention purge leaves behind.

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";

export async function deleteEventWithSlipTrace(opts: {
  orgId: string;
  eventId: string;
  user?: { id: string; displayName: string } | null;
  prismaClient?: PrismaClient;
}): Promise<boolean> {
  const db = opts.prismaClient ?? defaultPrisma;
  return db.$transaction(async (tx) => {
    const event = await tx.event.findFirst({
      where: { id: opts.eventId, orgId: opts.orgId },
      select: { id: true },
    });
    if (!event) return false;
    const slips = await tx.permissionSlip.findMany({
      where: { eventId: event.id },
      select: { id: true, signedAt: true },
    });
    if (slips.length) {
      await tx.auditLog.createMany({
        data: slips.map((s) => ({
          orgId: opts.orgId,
          userId: opts.user?.id ?? null,
          userDisplay: opts.user?.displayName ?? null,
          entityType: "PermissionSlip",
          entityId: s.id,
          action: "delete",
          summary: `Signed by parent/guardian for event ${event.id} at ${s.signedAt.toISOString()}; removed with the event`,
        })),
      });
    }
    await tx.event.delete({ where: { id: event.id } });
    return true;
  });
}
