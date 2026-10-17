// Deleting your own account (Apple requires it in every app you can sign
// up from, and the privacy policy promises it).
//
// The User row stays, renamed "Former member" with an address that can
// never receive mail, so a troop's records keep pointing at something:
// chat messages (youth-protection logs are never edited or removed),
// RSVPs, event staffing, counselor meetings and sign-offs, treasury
// entries, posts. What's personal to the account goes: sign-in methods,
// sessions, phone tokens, push devices, two-step codes, unit and chat
// memberships, reactions, the counselor directory listing, Lantern's
// saved trails and Claude connections. The roster (Member rows) belongs
// to the unit and follows its retention policy, not this.
//
// Someone who is the only admin of a unit can't delete until another
// leader is made admin, so no unit is left without anyone to run it.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const DELETED_NAME = "Former member";
export const DELETED_EMAIL_DOMAIN = "deleted.invalid";

export function deletedEmail(userId: string): string {
  return `deleted-${userId}@${DELETED_EMAIL_DOMAIN}`;
}

export type DeletionBlocker =
  | { kind: "super_admin" }
  | { kind: "only_admin"; orgId: string; orgName: string };

type Db = Prisma.TransactionClient | typeof prisma;

export async function deletionBlockers(userId: string, db: Db = prisma): Promise<DeletionBlocker[]> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      isSuperAdmin: true,
      memberships: {
        where: { role: "admin" },
        select: { org: { select: { id: true, displayName: true } } },
      },
    },
  });
  if (!user) return [];
  const blockers: DeletionBlocker[] = [];
  if (user.isSuperAdmin) blockers.push({ kind: "super_admin" });
  for (const { org } of user.memberships) {
    const otherAdmins = await db.orgMembership.count({
      where: { orgId: org.id, role: "admin", userId: { not: userId } },
    });
    if (otherAdmins === 0) blockers.push({ kind: "only_admin", orgId: org.id, orgName: org.displayName });
  }
  return blockers;
}

export class AccountDeletionBlocked extends Error {
  constructor(public readonly blockers: DeletionBlocker[]) {
    super("account_deletion_blocked");
  }
}

export function blockerMessage(b: DeletionBlocker): string {
  return b.kind === "super_admin"
    ? "You're a Compass operator. Another operator has to remove that first."
    : `You're the only admin of ${b.orgName}. Make another leader an admin first.`;
}

/** Deletes the account as described above. Throws AccountDeletionBlocked. */
export async function deleteAccount(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Lock the row so two deletes (or a delete racing a role change)
    // see the same admin counts.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const blockers = await deletionBlockers(userId, tx);
    if (blockers.length) throw new AccountDeletionBlocked(blockers);

    const where = { userId };
    await tx.session.deleteMany({ where });
    await tx.account.deleteMany({ where });
    await tx.passkey.deleteMany({ where });
    await tx.apiToken.deleteMany({ where });
    await tx.pushDevice.deleteMany({ where });
    await tx.backupCode.deleteMany({ where });
    await tx.orgMembership.deleteMany({ where });
    await tx.channelMember.deleteMany({ where });
    await tx.reaction.deleteMany({ where });
    await tx.postReaction.deleteMany({ where });
    await tx.feedbackVote.deleteMany({ where });
    await tx.counselorBadge.deleteMany({ where });
    await tx.journeyScout.deleteMany({ where: { ownerUserId: userId } });
    // Claude connections: codes and tokens (lib/mcp/oauth/tokens.ts).
    await tx.mcpAuthCode.deleteMany({ where });
    await tx.mcpToken.deleteMany({ where });
    await tx.org.updateMany({ where: { ownerId: userId }, data: { ownerId: null } });

    await tx.user.update({
      where: { id: userId },
      data: {
        email: deletedEmail(userId),
        displayName: DELETED_NAME,
        emailVerified: false,
        image: null,
        totpSecret: null,
        totpEnrolledAt: null,
        totpLastUsedAt: null,
        lastDmDigestSentAt: null,
      },
    });
  });
}
