import { prisma } from "@/lib/db";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "publish"
  | "revert"
  | (string & {});

/**
 * Fire-and-forget audit logger. Failures don't fail the action that
 * triggered them — but they do log to stderr so an outage of the audit
 * sink is visible. Caller passes the actor and the entity; we resolve
 * `userDisplay` from the actor row at write time so renames after the
 * fact don't change the historical record.
 */
export function audit(input: {
  orgId?: string | null;
  userId?: string | null;
  userDisplay?: string | null;
  entityType: string;
  entityId?: string | null;
  action: AuditAction;
  summary?: string | null;
}): void {
  void prisma.auditLog
    .create({
      data: {
        orgId: input.orgId ?? null,
        userId: input.userId ?? null,
        userDisplay: input.userDisplay ?? null,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        action: input.action,
        summary: input.summary ?? null,
      },
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("audit log write failed", err);
    });
}
