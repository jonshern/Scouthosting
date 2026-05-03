// TOTP-based 2FA. Wraps `otpauth` + `qrcode` so the rest of the app
// only sees a small surface (generate secret, build QR, verify code,
// mint/verify backup codes, mint/verify the pre-MFA token).
//
// Secret storage: base32 in User.totpSecret. Plaintext at rest is the
// v1 risk; future PR encrypts with an env-var key.
//
// Replay protection: User.totpLastUsedAt records the last successful
// verify. We reject codes whose 30s window has been used already, so
// a leaked code can't be replayed inside its remaining seconds.
//
// Backup codes: 10 random 8-digit numerics, argon2id-hashed at rest
// (same lib + params as passwords in lib/auth.js). Single-use; the
// usedAt column is set on first acceptance.
//
// Pre-MFA token: short-lived signed claim that says "this user
// completed password verification, owes us a TOTP code". Issued at
// password verify, redeemed at /mfa POST. 60s TTL.

import crypto from "node:crypto";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { hashPassword, verifyPassword } from "./auth.js";
import { makeSignedToken, verifySignedToken } from "./signedToken.js";

const APP_NAME = "Compass";

// 160-bit secret (32 base32 chars) — twice the RFC 6238 minimum.
function freshSecret() {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

/**
 * Generate the artifacts to enroll a user. Returns the secret (must
 * be persisted on User.totpSecret) plus the TOTP URI + a data-URL
 * QR code the enrollment page renders inline.
 */
export async function buildEnrollmentArtifacts({ userEmail }) {
  const secret = freshSecret();
  const totp = new OTPAuth.TOTP({
    issuer: APP_NAME,
    label: userEmail,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const uri = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(uri, { width: 240, margin: 1 });
  return { secret, uri, qrDataUrl };
}

/**
 * Verify a 6-digit TOTP code against the user's stored secret. Returns
 * { ok, reason } — `reason` is "invalid", "replay", or "no-secret"
 * on failure. Caller must persist totpLastUsedAt = the validated
 * window's start time on success to enable replay protection.
 *
 * Window tolerance: ±1 (so a 30s slot on either side passes).
 */
export function verifyTotp({ secret, token, lastUsedAt = null, now = new Date() }) {
  if (!secret) return { ok: false, reason: "no-secret" };
  const cleaned = String(token || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return { ok: false, reason: "invalid" };
  const totp = new OTPAuth.TOTP({
    issuer: APP_NAME,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  // delta = -1 / 0 / +1; null on no match.
  const delta = totp.validate({ token: cleaned, timestamp: now.getTime(), window: 1 });
  if (delta == null) return { ok: false, reason: "invalid" };
  // Window the user just satisfied:
  const periodStart = Math.floor(now.getTime() / 30000 + delta) * 30000;
  if (lastUsedAt && new Date(lastUsedAt).getTime() >= periodStart) {
    return { ok: false, reason: "replay" };
  }
  return { ok: true, periodStart: new Date(periodStart) };
}

/**
 * Mint 10 fresh backup codes for a user. Returns the plaintext codes
 * (caller MUST show them to the user once and never store the
 * plaintext) and the row payloads to insert into BackupCode.
 *
 * Format: 8 digits with a hyphen after the 4th — easier to read than
 * a flat 8-digit string. We strip the hyphen at verify time so users
 * can type either form.
 */
export async function mintBackupCodes({ userId, count = 10 }) {
  const codes = [];
  const rows = [];
  for (let i = 0; i < count; i++) {
    const raw = String(crypto.randomInt(10_000_000, 99_999_999));
    const display = `${raw.slice(0, 4)}-${raw.slice(4)}`;
    codes.push(display);
    rows.push({ userId, codeHash: await hashPassword(raw) });
  }
  return { codes, rows };
}

/**
 * Verify a user-typed backup code against the user's stored hashes.
 * Returns the matching BackupCode row id on success (caller marks
 * usedAt) or null on failure.
 *
 * Hyphens / spaces in user input are stripped before comparison.
 */
export async function verifyBackupCode({ userId, code, prismaClient }) {
  const cleaned = String(code || "").replace(/[^0-9]/g, "");
  if (!/^\d{8}$/.test(cleaned)) return null;
  const candidates = await prismaClient.backupCode.findMany({
    where: { userId, usedAt: null },
    select: { id: true, codeHash: true },
  });
  for (const c of candidates) {
    if (await verifyPassword(c.codeHash, cleaned)) {
      return c.id;
    }
  }
  return null;
}

const PRE_MFA_TTL_SECONDS = 60;

/**
 * Pre-MFA token: signed claim that says "this user completed password
 * verification, still owes us a second factor". Redeemed at /mfa POST.
 * Short TTL by design — if they tab away for too long they re-enter
 * the password.
 */
export function mintPreMfaToken({ userId, secret }) {
  return makeSignedToken({ kind: "pre-mfa", uid: userId }, { secret, ttlSeconds: PRE_MFA_TTL_SECONDS });
}

export function verifyPreMfaToken(token, { secret }) {
  const claims = verifySignedToken(token, { secret });
  if (!claims || claims.kind !== "pre-mfa") return null;
  return claims.uid;
}

export const _internal = {
  freshSecret,
  PRE_MFA_TTL_SECONDS,
  APP_NAME,
};
