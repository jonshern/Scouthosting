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
    if (result.ok) {
      await prisma.user.update({
        where: { id: dbUser.id },
        data: {
          totpLastUsedAt: new Date(result.lastUsedWindow!),
          // Enrolled before secrets were sealed: seal it now.
          ...(isSealedTotpSecret(dbUser.totpSecret) ? {} : { totpSecret: sealTotpSecret(secret, dbUser.id) }),
        },
      });
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
  if (idx >= 0) {
    await prisma.backupCode.update({
      where: { id: candidates[idx].id },
      data: { usedAt: new Date() },
    });
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
