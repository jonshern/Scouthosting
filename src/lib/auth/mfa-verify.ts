// Server-internal MFA verification helper. Called from server actions
// (sign-in second factor, settings step-up). Lives outside the
// `server-actions/` directory so it isn't mistaken for an externally
// invokable Server Action.

import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  isSealedTotpSecret,
  openTotpSecret,
  sealTotpSecret,
  verifyTotp,
  verifyBackupCode,
} from "@/lib/auth/mfa";

/**
 * Verify a code against a user's MFA state. Tries TOTP first, then
 * backup codes. On TOTP success bumps `totpLastUsedAt`; on backup-code
 * success marks that row consumed. Audits success and failure.
 *
 * Returns true on any successful verify, false otherwise.
 */
export async function verifyMfaCodeForUser(userId: string, code: string): Promise<boolean> {
  const trimmed = code.trim();
  if (!trimmed) return false;

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      totpSecret: true,
      totpEnrolledAt: true,
      totpLastUsedAt: true,
    },
  });
  if (!dbUser || !dbUser.totpSecret || !dbUser.totpEnrolledAt) return false;

  if (/^\s*\d{6}\s*$/.test(trimmed)) {
    const lastUsedWindow = dbUser.totpLastUsedAt ? dbUser.totpLastUsedAt.getTime() : null;
    const secret = openTotpSecret(dbUser.totpSecret, dbUser.id);
    const result = verifyTotp(secret, trimmed, new Date(), lastUsedWindow);
    // Claim the time window only if no one has used it yet: two sign-ins
    // racing with the same code both pass verifyTotp, but only one
    // conditional update matches.
    const window = result.ok ? new Date(result.lastUsedWindow!) : null;
    const claimed =
      window &&
      (
        await prisma.user.updateMany({
          where: { id: dbUser.id, OR: [{ totpLastUsedAt: null }, { totpLastUsedAt: { lt: window } }] },
          data: { totpLastUsedAt: window },
        })
      ).count === 1;
    if (claimed) {
      if (!isSealedTotpSecret(dbUser.totpSecret)) {
        // Enrolled before secrets were sealed: seal it now.
        await prisma.user.update({
          where: { id: dbUser.id },
          data: { totpSecret: sealTotpSecret(secret, dbUser.id) },
        });
      }
      await audit({
        action: "mfa.verify",
        entityType: "User",
        entityId: dbUser.id,
        userId: dbUser.id,
        userDisplay: dbUser.displayName,
        summary: "TOTP verified",
      });
      return true;
    }
  }

  const candidates = await prisma.backupCode.findMany({
    where: { userId: dbUser.id, usedAt: null },
    select: { id: true, codeHash: true },
  });
  const idx = await verifyBackupCode(candidates.map((c) => c.codeHash), trimmed);
  // Same for a backup code: only the request that marks it used wins.
  const consumed =
    idx >= 0 &&
    (
      await prisma.backupCode.updateMany({
        where: { id: candidates[idx].id, usedAt: null },
        data: { usedAt: new Date() },
      })
    ).count === 1;
  if (consumed) {
    await audit({
      action: "mfa.verify-backup",
      entityType: "User",
      entityId: dbUser.id,
      userId: dbUser.id,
      userDisplay: dbUser.displayName,
      summary: "Backup code consumed",
    });
    return true;
  }

  await audit({
    action: "mfa.verify-failed",
    entityType: "User",
    entityId: dbUser.id,
    userId: dbUser.id,
    userDisplay: dbUser.displayName,
    summary: "MFA code rejected",
  });
  return false;
}
