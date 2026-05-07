// Field-level encryption helpers. AAD binds each ciphertext to its
// org and a "purpose" string so a blob from `Member.encFirstName`
// cannot be silently moved into `Member.encEmail` (or another org's
// row) without triggering an auth-tag failure on read.

import { aesGcmEncrypt, aesGcmDecrypt } from "./primitives";

const AAD_FIELD_VERSION = "compass:field:v1";

export function fieldAad(orgId: string, purpose: string): string {
  return `${AAD_FIELD_VERSION}:${orgId}:${purpose}`;
}

/** Encrypt a string field. Returns null if input is null/empty. */
export function encryptField(
  plaintext: string | null | undefined,
  dek: Buffer,
  orgId: string,
  purpose: string,
): Buffer | null {
  if (plaintext == null || plaintext === "") return null;
  return aesGcmEncrypt(dek, plaintext, fieldAad(orgId, purpose));
}

/** Decrypt a string field. Null in → null out. Throws on tamper. */
export function decryptField(
  blob: Buffer | Uint8Array | null | undefined,
  dek: Buffer,
  orgId: string,
  purpose: string,
): string | null {
  if (!blob) return null;
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  const out = aesGcmDecrypt(dek, buf, fieldAad(orgId, purpose));
  return out.toString("utf8");
}

/** Encrypt arbitrary bytes (e.g. photo file). Same AAD scheme. */
export function encryptBytes(
  bytes: Buffer,
  dek: Buffer,
  orgId: string,
  purpose: string,
): Buffer {
  return aesGcmEncrypt(dek, bytes, fieldAad(orgId, purpose));
}

/** Decrypt arbitrary bytes. */
export function decryptBytes(
  blob: Buffer | Uint8Array,
  dek: Buffer,
  orgId: string,
  purpose: string,
): Buffer {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  return aesGcmDecrypt(dek, buf, fieldAad(orgId, purpose));
}
