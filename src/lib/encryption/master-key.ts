// Master key custody. Reads MASTER_KEY from the environment, decodes
// it as 32 bytes of hex, and memoizes the result. Every per-org DEK
// has a wrap encrypted with this key — losing the master key without
// the recovery code is catastrophic.
//
// In production the master key MUST be set; we fail loudly so a
// misconfigured deploy never silently runs without encryption. In
// dev/test we generate an ephemeral key per-process so unit tests
// don't need to set MASTER_KEY in CI.

import { randomBytes } from "node:crypto";

let cached: Buffer | null = null;

export function getMasterKey(): Buffer {
  if (cached) return cached;
  const raw = process.env.MASTER_KEY;
  if (raw && raw.length > 0) {
    if (!/^[0-9a-fA-F]+$/.test(raw)) {
      throw new Error("MASTER_KEY must be hex-encoded (no 0x prefix).");
    }
    const buf = Buffer.from(raw, "hex");
    if (buf.length !== 32) {
      throw new Error(`MASTER_KEY must decode to 32 bytes (got ${buf.length}). Generate one with: openssl rand -hex 32`);
    }
    cached = buf;
    return cached;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("MASTER_KEY env var is required in production. Generate one with: openssl rand -hex 32");
  }
  // Dev/test fallback: ephemeral key. Encrypted data won't survive a
  // process restart, but that's fine for unit tests and `npm run dev`
  // sessions on a freshly seeded DB. Logged so it's not surprising.
  cached = randomBytes(32);
  // eslint-disable-next-line no-console
  console.warn("[encryption] MASTER_KEY unset — using ephemeral key (dev/test only).");
  return cached;
}

/** Test/seed-only: clear the cache so a new MASTER_KEY can be picked up. */
export function _resetMasterKeyForTests(): void {
  cached = null;
}

/** True if MASTER_KEY is configured in env (regardless of cache state). */
export function masterKeyConfigured(): boolean {
  const raw = process.env.MASTER_KEY;
  if (!raw) return false;
  if (!/^[0-9a-fA-F]+$/.test(raw)) return false;
  return Buffer.from(raw, "hex").length === 32;
}
