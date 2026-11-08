// Writing requirement progress for one scout: the rules behind
// PUT /api/v1/scouts/:id/progress, shared with Compass's Advancement
// page so a sign-off made on the web is the same as one from Waypoint.
//
// All or nothing. Who may do what is writeRefusal (lib/counselor/ids.ts):
// leaders and the assigned counselor sign off; families track. Every
// change appends a RequirementProgressEvent, and sign-off changes also
// go to the org's AuditLog. The caller has already checked membership.

import { prisma } from "@/lib/db";
import { writeRefusal, type ProgressStatus, type ScoutRelation } from "@/lib/counselor/ids";

export type ProgressItem = { requirementId: string; status: ProgressStatus; note?: string | null };

export class ProgressRefused extends Error {
  constructor(
    readonly reason: "sign_off_not_allowed" | "not_assigned",
    readonly requirementId: string,
  ) {
    super(reason);
    this.name = "ProgressRefused";
  }
}

export async function writeProgress(
  scout: { id: string; orgId: string },
  rel: ScoutRelation,
  user: { id: string; displayName: string | null },
  items: ProgressItem[],
): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // One writer per scout at a time. The permission check depends on
    // the current status (family can't undo a sign-off), so it must see
    // the row as it is when we write, not as it was a moment before: a
    // scout's "done" racing a counselor's sign-off would otherwise land
    // second and quietly undo it. Locking the scout covers rows that
    // don't exist yet, which a row lock can't.
    await tx.$queryRaw`SELECT id FROM "Member" WHERE id = ${scout.id} FOR NO KEY UPDATE`;
    const existing = await tx.requirementProgress.findMany({
      where: { memberId: scout.id, requirementId: { in: items.map((i) => i.requirementId) } },
    });
    const current = new Map(existing.map((r) => [r.requirementId, r]));

    // Check every item before writing any.
    for (const item of items) {
      const from = (current.get(item.requirementId)?.status ?? null) as ProgressStatus | null;
      const reason = writeRefusal(rel, item.requirementId, from, item.status);
      if (reason) throw new ProgressRefused(reason, item.requirementId);
    }

    for (const item of items) {
      const prev = current.get(item.requirementId);
      const fromStatus = prev?.status ?? null;
      const note = item.note === undefined ? (prev?.note ?? null) : item.note || null;
      if (prev && prev.status === item.status && prev.note === note) continue;

      const signOff =
        item.status === "signed_off"
          ? prev?.status === "signed_off"
            ? { signedOffById: prev.signedOffById, signedOffAt: prev.signedOffAt }
            : { signedOffById: user.id, signedOffAt: now }
          : { signedOffById: null, signedOffAt: null };

      const row = await tx.requirementProgress.upsert({
        where: { memberId_requirementId: { memberId: scout.id, requirementId: item.requirementId } },
        create: {
          orgId: scout.orgId,
          memberId: scout.id,
          requirementId: item.requirementId,
          status: item.status,
          note,
          updatedById: user.id,
          ...signOff,
        },
        update: { status: item.status, note, updatedById: user.id, ...signOff },
      });
      await tx.requirementProgressEvent.create({
        data: {
          orgId: scout.orgId,
          memberId: scout.id,
          requirementId: item.requirementId,
          fromStatus,
          toStatus: item.status,
          note,
          actorUserId: user.id,
        },
      });
      if ((item.status === "signed_off") !== (fromStatus === "signed_off")) {
        await tx.auditLog.create({
          data: {
            orgId: scout.orgId,
            userId: user.id,
            userDisplay: user.displayName,
            entityType: "RequirementProgress",
            entityId: row.id,
            action: item.status === "signed_off" ? "sign_off" : "undo_sign_off",
            summary: `${item.requirementId} ${fromStatus ?? "none"} → ${item.status}`,
          },
        });
      }
    }
  });

}
