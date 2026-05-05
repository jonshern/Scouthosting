// TOTP-based MFA. Wraps `otpauth` so the rest of the app sees a small
// surface: generate secret, build provisioning URI, verify code,
// mint/verify backup codes.
//
// Secret storage: base32 in User.totpSecret (plaintext at rest is the
// v1 risk; future PR encrypts with an env-var key).
//
// Replay protection: User.totpLastUsedAt records the last successful
// verify. A code whose 30s window has been used already is rejected
// so a leaked-but-still-valid code can't be replayed.
//
// Backup codes: 10 random 8-digit numerics, argon2id-hashed at rest
// (same lib + params as passwords). Single-use; the BackupCode.usedAt
// column is set on first acceptance.

import crypto from "node:crypto";
import * as OTPAuth from "otpauth";
import { hashPassword, verifyPassword } from "./password";

const APP_NAME = "Compass";
const PERIOD_MS = 30_000;
const WINDOW = 1; // ±1 30s slot tolerance

/** 160-bit (32 base32 char) secret; twice the RFC 6238 minimum. */
export function generateSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

/**
 * Build the otpauth:// provisioning URI a user can paste into an
 * authenticator app or render as a QR code on the client.
 */
export function provisioningUri(secret: string, label: string, issuer: string = APP_NAME): string {
  const totp = new OTPAuth.TOTP({
    issuer,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.toString();
}

export type VerifyTotpResult = { ok: boolean; lastUsedWindow: number | null };

/**
 * Verify a 6-digit TOTP code against `secret`. `lastUsedWindow` is the
 * ms-epoch of the previously-accepted window; if the matching window is
 * not strictly newer than it, treat the code as a replay and reject.
 *
 * Window tolerance: ±1 (so a 30s slot on either side passes).
 *
 * On success, returns `{ ok: true, lastUsedWindow: <new window start> }`.
 * The caller MUST persist that value to User.totpLastUsedAt to enable
 * replay protection on the next verify.
 */
export function verifyTotp(
  secret: string | null | undefined,
  code: string | null | undefined,
  now: Date = new Date(),
  lastUsedWindow: number | null = null,
): VerifyTotpResult {
  if (!secret) return { ok: false, lastUsedWindow: null };
  const cleaned = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return { ok: false, lastUsedWindow: null };

  const totp = new OTPAuth.TOTP({
    issuer: APP_NAME,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token: cleaned, timestamp: now.getTime(), window: WINDOW });
  if (delta == null) return { ok: false, lastUsedWindow: null };

  const windowStart = (Math.floor(now.getTime() / PERIOD_MS) + delta) * PERIOD_MS;
  if (lastUsedWindow != null && lastUsedWindow >= windowStart) {
    return { ok: false, lastUsedWindow: null };
  }
  return { ok: true, lastUsedWindow: windowStart };
}

export type GeneratedBackupCodes = {
  /** Plaintext codes to display once to the user. */
  plaintext: string[];
  /** argon2id hashes corresponding 1:1 with `plaintext`. */
  hashes: string[];
};

/**
 * Mint `n` fresh backup codes. Returns plaintext (display once, never
 * persist) and per-code argon2id hashes (persist on BackupCode.codeHash).
 *
 * Format: 8 digits with a hyphen after the 4th — easier to read than a
 * flat 8-digit string. Hyphens / spaces are stripped at verify time.
 */
export async function generateBackupCodes(n: number = 10): Promise<GeneratedBackupCodes> {
  const plaintext: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < n; i++) {
    const raw = String(crypto.randomInt(10_000_000, 100_000_000));
    const display = `${raw.slice(0, 4)}-${raw.slice(4)}`;
    plaintext.push(display);
    hashes.push(await hashPassword(raw));
  }
  return { plaintext, hashes };
}

/**
 * Verify a user-typed backup code against the user's stored hashes.
 * Returns the matching index (0-based) or -1 if no match. Comparison
 * is the standard argon2id `verify` (constant-time on the hash).
 *
 * Hyphens / spaces in user input are stripped before comparison, so
 * users may type either form.
 */
export async function verifyBackupCode(hashList: string[], plaintext: string): Promise<number> {
  const cleaned = String(plaintext || "").replace(/[^0-9]/g, "");
  if (!/^\d{8}$/.test(cleaned)) return -1;
  for (let i = 0; i < hashList.length; i++) {
    if (await verifyPassword(hashList[i], cleaned)) return i;
  }
  return -1;
}
