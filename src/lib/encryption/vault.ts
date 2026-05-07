// Org vault: provisioning + unwrap.
//
// Each org has a 32-byte DEK that encrypts roster PII and photo
// bytes. The DEK is wrapped three ways (envelope encryption):
//
//   1. encryptedDek         = AES-GCM(DEK, MASTER_KEY)
//      Server uses this on every read/write — no admin interaction.
//
//   2. passphraseWrappedDek = AES-GCM(DEK, argon2id(passphrase, salt))
//      Admin chooses passphrase at creation. Used to re-wrap if
//      MASTER_KEY is rotated/lost, or to rotate the DEK itself.
//
//   3. recoveryWrappedDek   = AES-GCM(DEK, hkdf(recoveryCode, salt))
//      Server-generated recovery code shown ONCE at provisioning.
//      Used if admin forgets passphrase.
//
// Verifier hashes (passphraseVerifier, recoveryVerifier) let us
// answer "wrong passphrase" without unwrapping anything — the wraps
// stay sealed unless we have a verified secret.

import {
  aesGcmEncrypt,
  aesGcmDecrypt,
  argon2idKdf,
  argon2idVerifierHash,
  argon2idVerifierVerify,
  formatRecoveryCode,
  hkdf,
  parseRecoveryCode,
  randomBytes,
} from "./primitives";
import { getMasterKey } from "./master-key";
import { createHash } from "node:crypto";

const AAD_DEK_WRAP = "compass:dek-wrap:v1";

export type VaultProvisionFields = {
  encryptedDek: Buffer;
  passphraseWrappedDek: Buffer;
  passphraseSalt: Buffer;
  passphraseVerifier: string;
  recoveryWrappedDek: Buffer;
  recoverySalt: Buffer;
  recoveryVerifier: string;
  keyVersion: number;
  keyRotatedAt: Date;
};

export type OrgVaultColumns = {
  encryptedDek: Buffer;
  passphraseWrappedDek: Buffer;
  passphraseSalt: Buffer;
  passphraseVerifier: string;
  recoveryWrappedDek: Buffer;
  recoverySalt: Buffer;
  recoveryVerifier: string;
};

export class WrongPassphraseError extends Error {
  constructor() {
    super("Wrong passphrase.");
  }
}

export class WrongRecoveryCodeError extends Error {
  constructor() {
    super("Wrong recovery code.");
  }
}

/** Generate a fresh DEK + recovery code, wrap three ways, return columns. */
export async function provisionOrgVault(
  passphrase: string,
  opts?: { recoveryCodeOverride?: string },
): Promise<{ fields: VaultProvisionFields; recoveryCode: string; dek: Buffer }> {
  if (!passphrase || passphrase.length < 12) {
    throw new Error("Passphrase must be at least 12 characters.");
  }
  const dek = randomBytes(32);

  // Wrap 1: master key
  const encryptedDek = aesGcmEncrypt(getMasterKey(), dek, AAD_DEK_WRAP);

  // Wrap 2: passphrase
  const passphraseSalt = randomBytes(16);
  const passKey = await argon2idKdf(passphrase, passphraseSalt);
  const passphraseWrappedDek = aesGcmEncrypt(passKey, dek, AAD_DEK_WRAP);
  const passphraseVerifier = await argon2idVerifierHash(passphrase);

  // Wrap 3: recovery code
  const recoveryBytes = opts?.recoveryCodeOverride
    ? parseRecoveryCode(opts.recoveryCodeOverride)
    : randomBytes(32);
  const recoveryCode = opts?.recoveryCodeOverride ?? formatRecoveryCode(recoveryBytes);
  const recoverySalt = randomBytes(16);
  const recoveryKey = hkdf(recoveryBytes, recoverySalt, "compass:recovery-kek:v1", 32);
  const recoveryWrappedDek = aesGcmEncrypt(recoveryKey, dek, AAD_DEK_WRAP);
  const recoveryVerifier = createHash("sha256").update(recoveryBytes).digest("hex");

  return {
    fields: {
      encryptedDek,
      passphraseWrappedDek,
      passphraseSalt,
      passphraseVerifier,
      recoveryWrappedDek,
      recoverySalt,
      recoveryVerifier,
      keyVersion: 1,
      keyRotatedAt: new Date(),
    },
    recoveryCode,
    dek,
  };
}

/** Unwrap with the master key. Used everywhere on the read/write path.
 *  Accepts a possibly-null `encryptedDek` for ergonomics — callers
 *  typically pass a Prisma row straight through. Throws when no vault
 *  is provisioned, so call after a `!org.encryptedDek` early-return. */
export function unwrapDekWithMaster(
  org: { encryptedDek: Buffer | Uint8Array | null | undefined },
): Buffer {
  if (!org.encryptedDek) {
    throw new Error("Org encryption vault is not provisioned (encryptedDek is null).");
  }
  const blob = Buffer.isBuffer(org.encryptedDek)
    ? org.encryptedDek
    : Buffer.from(org.encryptedDek);
  return aesGcmDecrypt(getMasterKey(), blob, AAD_DEK_WRAP);
}

/** Unwrap with admin's passphrase. Throws WrongPassphraseError on mismatch. */
export async function unwrapDekWithPassphrase(
  org: {
    passphraseWrappedDek: Buffer | Uint8Array;
    passphraseSalt: Buffer | Uint8Array;
    passphraseVerifier: string;
  },
  passphrase: string,
): Promise<Buffer> {
  const ok = await argon2idVerifierVerify(org.passphraseVerifier, passphrase);
  if (!ok) throw new WrongPassphraseError();
  const salt = Buffer.isBuffer(org.passphraseSalt)
    ? org.passphraseSalt
    : Buffer.from(org.passphraseSalt);
  const blob = Buffer.isBuffer(org.passphraseWrappedDek)
    ? org.passphraseWrappedDek
    : Buffer.from(org.passphraseWrappedDek);
  const passKey = await argon2idKdf(passphrase, salt);
  try {
    return aesGcmDecrypt(passKey, blob, AAD_DEK_WRAP);
  } catch {
    // Verifier passed but unwrap failed → almost certainly tampered DB row.
    throw new Error("Vault corrupted: passphrase verifier passed but unwrap failed.");
  }
}

/** Unwrap with the one-time recovery code. */
export function unwrapDekWithRecovery(
  org: {
    recoveryWrappedDek: Buffer | Uint8Array;
    recoverySalt: Buffer | Uint8Array;
    recoveryVerifier: string;
  },
  recoveryCode: string,
): Buffer {
  let recoveryBytes: Buffer;
  try {
    recoveryBytes = parseRecoveryCode(recoveryCode);
  } catch {
    throw new WrongRecoveryCodeError();
  }
  const expected = createHash("sha256").update(recoveryBytes).digest("hex");
  if (expected !== org.recoveryVerifier) throw new WrongRecoveryCodeError();
  const salt = Buffer.isBuffer(org.recoverySalt)
    ? org.recoverySalt
    : Buffer.from(org.recoverySalt);
  const blob = Buffer.isBuffer(org.recoveryWrappedDek)
    ? org.recoveryWrappedDek
    : Buffer.from(org.recoveryWrappedDek);
  const recoveryKey = hkdf(recoveryBytes, salt, "compass:recovery-kek:v1", 32);
  return aesGcmDecrypt(recoveryKey, blob, AAD_DEK_WRAP);
}

/** Compute the new wrap fields for a new passphrase. Caller persists. */
export async function rewrapPassphrase(
  dek: Buffer,
  newPassphrase: string,
): Promise<{ passphraseWrappedDek: Buffer; passphraseSalt: Buffer; passphraseVerifier: string }> {
  if (!newPassphrase || newPassphrase.length < 12) {
    throw new Error("Passphrase must be at least 12 characters.");
  }
  const passphraseSalt = randomBytes(16);
  const passKey = await argon2idKdf(newPassphrase, passphraseSalt);
  const passphraseWrappedDek = aesGcmEncrypt(passKey, dek, AAD_DEK_WRAP);
  const passphraseVerifier = await argon2idVerifierHash(newPassphrase);
  return { passphraseWrappedDek, passphraseSalt, passphraseVerifier };
}

/** Generate a new recovery code wrapping the existing DEK. Caller persists. */
export function regenerateRecovery(dek: Buffer): {
  recoveryCode: string;
  recoveryWrappedDek: Buffer;
  recoverySalt: Buffer;
  recoveryVerifier: string;
} {
  const recoveryBytes = randomBytes(32);
  const recoveryCode = formatRecoveryCode(recoveryBytes);
  const recoverySalt = randomBytes(16);
  const recoveryKey = hkdf(recoveryBytes, recoverySalt, "compass:recovery-kek:v1", 32);
  const recoveryWrappedDek = aesGcmEncrypt(recoveryKey, dek, AAD_DEK_WRAP);
  const recoveryVerifier = createHash("sha256").update(recoveryBytes).digest("hex");
  return { recoveryCode, recoveryWrappedDek, recoverySalt, recoveryVerifier };
}

/** Re-wrap a DEK with the master key. Used after rotating MASTER_KEY. */
export function rewrapMaster(dek: Buffer): Buffer {
  return aesGcmEncrypt(getMasterKey(), dek, AAD_DEK_WRAP);
}
