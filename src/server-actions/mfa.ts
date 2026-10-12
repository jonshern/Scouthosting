"use server";

import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import {
  generateSecret,
  provisioningUri,
  verifyTotp,
  generateBackupCodes,
  openTotpSecret,
  sealTotpSecret,
} from "@/lib/auth/mfa";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { verifyMfaCodeForUser } from "@/lib/auth/mfa-verify";
import { accountStanding, mfaLocked } from "@/lib/auth/requirements";
import { DEMO_LOCKED_MESSAGE, isDemoMode } from "@/lib/demo/mode";

export type MfaState = { error?: string; ok?: true } | null;

export type EnrollResult =
  | {
      ok: true;
      secret: string;
      uri: string;
      backupCodes: string[];
    }
  | { ok: false; error: string };

export type ConfirmResult = { ok: true } | { ok: false; error: string };
export type RegenerateResult =
  | { ok: true; backupCodes: string[] }
  | { ok: false; error: string };

async function preFlight(formData: FormData): Promise<{ error: string } | null> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF token." };
  return null;
}

export async function enrollMfa(formData: FormData): Promise<EnrollResult> {
  const fail = await preFlight(formData);
  if (fail) return { ok: false, error: fail.error };

  const { user } = await getSession();
  if (!user) return { ok: false, error: "Not signed in." };
  if (isDemoMode()) return { ok: false, error: DEMO_LOCKED_MESSAGE };

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, displayName: true, totpEnrolledAt: true },
  });
  if (!dbUser) return { ok: false, error: "Not signed in." };
  if (dbUser.totpEnrolledAt) {
    return { ok: false, error: "MFA is already enabled. Disable it first to re-enroll." };
  }

  const secret = generateSecret();
  const { plaintext, hashes } = await generateBackupCodes(10);
  const uri = provisioningUri(secret, dbUser.email);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: dbUser.id },
      data: { totpSecret: sealTotpSecret(secret, dbUser.id), totpEnrolledAt: null, totpLastUsedAt: null },
    }),
    prisma.backupCode.deleteMany({ where: { userId: dbUser.id } }),
    prisma.backupCode.createMany({
      data: hashes.map((codeHash) => ({ userId: dbUser.id, codeHash })),
    }),
  ]);

  await audit({
    action: "mfa.enroll-begin",
    entityType: "User",
    entityId: dbUser.id,
    userId: dbUser.id,
    userDisplay: dbUser.displayName,
    summary: "Began MFA enrollment",
  });

  return { ok: true, secret, uri, backupCodes: plaintext };
}

export async function confirmMfa(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const fail = await preFlight(formData);
  if (fail) return fail;

  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };

  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter the 6-digit code from your authenticator app." };

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      displayName: true,
      totpSecret: true,
      totpEnrolledAt: true,
      totpLastUsedAt: true,
    },
  });
  if (!dbUser || !dbUser.totpSecret) return { error: "Start enrollment first." };
  if (dbUser.totpEnrolledAt) return { error: "MFA is already enabled." };

  const result = verifyTotp(
    openTotpSecret(dbUser.totpSecret, dbUser.id),
    code,
    new Date(),
    dbUser.totpLastUsedAt ? dbUser.totpLastUsedAt.getTime() : null,
  );
  if (!result.ok) {
    await audit({
      action: "mfa.confirm-failed",
      entityType: "User",
      entityId: dbUser.id,
      userId: dbUser.id,
      userDisplay: dbUser.displayName,
      summary: "Failed MFA confirmation code",
    });
    return { error: "That code is invalid or expired. Try again." };
  }

  const now = new Date();
  await prisma.user.update({
    where: { id: dbUser.id },
    data: { totpEnrolledAt: now, totpLastUsedAt: new Date(result.lastUsedWindow!) },
  });
  await audit({
    action: "mfa.enroll-complete",
    entityType: "User",
    entityId: dbUser.id,
    userId: dbUser.id,
    userDisplay: dbUser.displayName,
    summary: "Completed MFA enrollment",
  });
  return { ok: true };
}

export async function verifyMfa(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const fail = await preFlight(formData);
  if (fail) return fail;
  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter your 6-digit code or a backup code." };
  const ok = await verifyMfaCodeForUser(user.id, code);
  return ok ? { ok: true } : { error: "That code is invalid." };
}

export async function disableMfa(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const fail = await preFlight(formData);
  if (fail) return fail;
  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter a current 6-digit code or a backup code to confirm." };
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, displayName: true, totpEnrolledAt: true },
  });
  if (!dbUser) return { error: "Not signed in." };
  if (!dbUser.totpEnrolledAt) return { error: "MFA is not enabled." };
  if (mfaLocked(await accountStanding(user.id))) {
    return { error: "Leaders and admins must keep two-step sign-in on." };
  }
  const ok = await verifyMfaCodeForUser(user.id, code);
  if (!ok) return { error: "That code is invalid." };
  await prisma.$transaction([
    prisma.user.update({
      where: { id: dbUser.id },
      data: { totpSecret: null, totpEnrolledAt: null, totpLastUsedAt: null },
    }),
    prisma.backupCode.deleteMany({ where: { userId: dbUser.id } }),
  ]);
  await audit({
    action: "mfa.disable",
    entityType: "User",
    entityId: dbUser.id,
    userId: dbUser.id,
    userDisplay: dbUser.displayName,
    summary: "Disabled MFA",
  });
  return { ok: true };
}

export async function regenerateBackupCodes(formData: FormData): Promise<RegenerateResult> {
  const fail = await preFlight(formData);
  if (fail) return { ok: false, error: fail.error };
  const { user } = await getSession();
  if (!user) return { ok: false, error: "Not signed in." };
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { ok: false, error: "Enter a current 6-digit code or a backup code." };
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, displayName: true, totpEnrolledAt: true },
  });
  if (!dbUser) return { ok: false, error: "Not signed in." };
  if (!dbUser.totpEnrolledAt) return { ok: false, error: "MFA is not enabled." };
  const ok = await verifyMfaCodeForUser(user.id, code);
  if (!ok) return { ok: false, error: "That code is invalid." };
  const { plaintext, hashes } = await generateBackupCodes(10);
  await prisma.$transaction([
    prisma.backupCode.deleteMany({ where: { userId: dbUser.id } }),
    prisma.backupCode.createMany({
      data: hashes.map((codeHash) => ({ userId: dbUser.id, codeHash })),
    }),
  ]);
  await audit({
    action: "mfa.regenerate-backup",
    entityType: "User",
    entityId: dbUser.id,
    userId: dbUser.id,
    userDisplay: dbUser.displayName,
    summary: "Regenerated backup codes",
  });
  return { ok: true, backupCodes: plaintext };
}
