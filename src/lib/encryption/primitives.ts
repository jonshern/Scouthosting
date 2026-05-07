// Crypto primitives for per-org envelope encryption.
//
// All AEAD operations use AES-256-GCM with a 12-byte random IV and
// the standard 16-byte authentication tag, layout `iv || tag || ct`.
// AAD binds a ciphertext to its purpose so a copy-paste of an
// encrypted blob from one column into another fails to decrypt.
//
// Key derivation:
//   - scrypt: user-typed passphrases → AES-256 key. Memory-hard,
//             deterministic given the same salt, supplied by node:crypto.
//             We don't use @node-rs/argon2 as a KDF because its
//             `salt` option doesn't reliably produce deterministic
//             output for raw-key derivation (its primary use is the
//             encoded verifier hash).
//   - argon2id: verifier hashes ("did the user type the right
//               passphrase?"). Self-contained encoded format.
//   - hkdf: high-entropy inputs (recovery codes, subkeys).

import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes as nodeRandomBytes,
  scryptSync,
} from "node:crypto";
import { hash as argon2hash, verify as argon2verify } from "@node-rs/argon2";

const IV_LEN = 12;
const TAG_LEN = 16;

// scrypt parameters: N=2^15 is ~50ms per derivation on modern
// hardware, appropriate for one-shot provisioning + occasional
// recovery flows. Bump N if the threat model warrants it.
const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024; // 64 MiB ceiling for scryptSync

const ARGON_PARAMS_VERIFIER = {
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

export function randomBytes(n: number): Buffer {
  return nodeRandomBytes(n);
}

/** AES-256-GCM AEAD encrypt. Returns iv|tag|ciphertext as a single Buffer. */
export function aesGcmEncrypt(key: Buffer, plaintext: Buffer | string, aad?: string): Buffer {
  if (key.length !== 32) throw new Error(`AES key must be 32 bytes, got ${key.length}`);
  const iv = nodeRandomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const pt = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext;
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

/** AES-256-GCM AEAD decrypt. Throws on tampering / wrong key / wrong AAD. */
export function aesGcmDecrypt(key: Buffer, blob: Buffer, aad?: string): Buffer {
  if (key.length !== 32) throw new Error(`AES key must be 32 bytes, got ${key.length}`);
  if (blob.length < IV_LEN + TAG_LEN) throw new Error("ciphertext too short");
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** scrypt KDF for a user-typed passphrase. Salt should be ≥ 16 random bytes.
 *  Returns a deterministic 32-byte AES-256 key. Async wrapper to keep the
 *  call signature consistent with the existing (async) callers in vault.ts. */
export function argon2idKdf(passphrase: string, salt: Buffer): Promise<Buffer> {
  return Promise.resolve(
    scryptSync(passphrase.normalize("NFKC"), salt, 32, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAXMEM,
    }),
  );
}

/** Argon2id verifier hash for "did you type the right passphrase" checks. */
export function argon2idVerifierHash(passphrase: string): Promise<string> {
  return argon2hash(passphrase, ARGON_PARAMS_VERIFIER);
}

export function argon2idVerifierVerify(encoded: string, passphrase: string): Promise<boolean> {
  return argon2verify(encoded, passphrase, ARGON_PARAMS_VERIFIER);
}

/** HKDF-SHA256. */
export function hkdf(ikm: Buffer, salt: Buffer, info: string, length: number): Buffer {
  return Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from(info, "utf8"), length));
}

/** Format a 32-byte recovery code as user-friendly text. */
export function formatRecoveryCode(buf: Buffer): string {
  if (buf.length !== 32) throw new Error("recovery code must derive from 32 bytes");
  // Crockford-base32 (no I/L/O/U) keeps codes unambiguous.
  const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const out: string[] = [];
  let acc = 0n;
  for (const b of buf) acc = (acc << 8n) | BigInt(b);
  // 32 bytes = 256 bits → 52 base32 chars.
  for (let i = 0; i < 52; i++) {
    out.push(ALPHA[Number(acc & 31n)]);
    acc >>= 5n;
  }
  out.reverse();
  // Group into 4-char blocks for readability.
  const chunks: string[] = [];
  for (let i = 0; i < out.length; i += 4) chunks.push(out.slice(i, i + 4).join(""));
  return `cmps-${chunks.join("-")}`;
}

/** Parse a formatted recovery code back to its 32-byte buffer. */
export function parseRecoveryCode(input: string): Buffer {
  const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const cleaned = input
    .trim()
    .toUpperCase()
    .replace(/^CMPS-?/, "")
    .replace(/-/g, "")
    // Crockford normalizations: O→0, I/L→1, U→V
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
  if (cleaned.length !== 52) throw new Error("recovery code malformed");
  let acc = 0n;
  for (const ch of cleaned) {
    const idx = ALPHA.indexOf(ch);
    if (idx === -1) throw new Error(`invalid character in recovery code: ${ch}`);
    acc = (acc << 5n) | BigInt(idx);
  }
  const buf = Buffer.alloc(32);
  for (let i = 31; i >= 0; i--) {
    buf[i] = Number(acc & 0xffn);
    acc >>= 8n;
  }
  return buf;
}
