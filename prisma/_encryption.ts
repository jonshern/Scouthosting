// Seed-only encryption helpers. The runtime image only copies
// `prisma/` (not `src/`), so `prisma/seed.ts` can't import from
// `@/lib/encryption`. This file is a deliberate dupe of the bits the
// seed needs, kept in sync with src/lib/encryption/{primitives,vault,field}.ts.
//
// SOURCE OF TRUTH: src/lib/encryption/. If you change wrap formats,
// AAD strings, or the recovery-code alphabet, change them THERE first
// and mirror here. The unit suite has tests in src/lib/encryption/
// that exercise the real lib; this dupe is verified at runtime by
// the seed succeeding (provisioned wraps must round-trip).

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { hash as argon2hash } from "@node-rs/argon2";

const IV_LEN = 12;
const TAG_LEN = 16;
const AAD_DEK_WRAP = "compass:dek-wrap:v1";
const AAD_FIELD_VERSION = "compass:field:v1";

const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

const ARGON_PARAMS_VERIFIER = {
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

function aesGcmEncrypt(key: Buffer, plaintext: Buffer | string, aad: string): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const pt = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext;
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

function aesGcmDecrypt(key: Buffer, blob: Buffer, aad: string): Buffer {
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

function scryptKdf(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase.normalize("NFKC"), salt, 32, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
}

function hkdf(ikm: Buffer, salt: Buffer, info: string, length: number): Buffer {
  return Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from(info, "utf8"), length));
}

function formatRecoveryCode(buf: Buffer): string {
  const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const out: string[] = [];
  let acc = 0n;
  for (const b of buf) acc = (acc << 8n) | BigInt(b);
  for (let i = 0; i < 52; i++) {
    out.push(ALPHA[Number(acc & 31n)]);
    acc >>= 5n;
  }
  out.reverse();
  const chunks: string[] = [];
  for (let i = 0; i < out.length; i += 4) chunks.push(out.slice(i, i + 4).join(""));
  return `cmps-${chunks.join("-")}`;
}

function getMasterKey(): Buffer {
  const raw = process.env.MASTER_KEY;
  if (raw && /^[0-9a-fA-F]+$/.test(raw)) {
    const buf = Buffer.from(raw, "hex");
    if (buf.length === 32) return buf;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("MASTER_KEY env var is required in production.");
  }
  // eslint-disable-next-line no-console
  console.warn("[seed/encryption] MASTER_KEY unset — using ephemeral key (dev only).");
  return randomBytes(32);
}

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

export async function provisionOrgVault(
  passphrase: string,
): Promise<{ fields: VaultProvisionFields; recoveryCode: string; dek: Buffer }> {
  if (!passphrase || passphrase.length < 12) {
    throw new Error("Passphrase must be at least 12 characters.");
  }
  const dek = randomBytes(32);
  const masterKey = getMasterKey();
  const encryptedDek = aesGcmEncrypt(masterKey, dek, AAD_DEK_WRAP);

  const passphraseSalt = randomBytes(16);
  const passKey = scryptKdf(passphrase, passphraseSalt);
  const passphraseWrappedDek = aesGcmEncrypt(passKey, dek, AAD_DEK_WRAP);
  const passphraseVerifier = await argon2hash(passphrase, ARGON_PARAMS_VERIFIER);

  const recoveryBytes = randomBytes(32);
  const recoveryCode = formatRecoveryCode(recoveryBytes);
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

export async function unwrapDekWithPassphrase(
  org: {
    passphraseWrappedDek: Buffer | Uint8Array;
    passphraseSalt: Buffer | Uint8Array;
  },
  passphrase: string,
): Promise<Buffer> {
  const salt = Buffer.isBuffer(org.passphraseSalt)
    ? org.passphraseSalt
    : Buffer.from(org.passphraseSalt);
  const blob = Buffer.isBuffer(org.passphraseWrappedDek)
    ? org.passphraseWrappedDek
    : Buffer.from(org.passphraseWrappedDek);
  const passKey = scryptKdf(passphrase, salt);
  return aesGcmDecrypt(passKey, blob, AAD_DEK_WRAP);
}

export function encryptField(
  plaintext: string | null | undefined,
  dek: Buffer,
  orgId: string,
  purpose: string,
): Buffer | null {
  if (plaintext == null || plaintext === "") return null;
  return aesGcmEncrypt(dek, plaintext, `${AAD_FIELD_VERSION}:${orgId}:${purpose}`);
}
