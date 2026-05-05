import { hash, verify } from "@node-rs/argon2";

const ARGON_PARAMS = {
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

export function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, ARGON_PARAMS);
}

export function verifyPassword(hashStr: string, plaintext: string): Promise<boolean> {
  return verify(hashStr, plaintext, ARGON_PARAMS);
}

export function passwordValid(plaintext: string): { ok: true } | { ok: false; reason: string } {
  if (plaintext.length < 12) return { ok: false, reason: "Password must be at least 12 characters." };
  if (plaintext.length > 200) return { ok: false, reason: "Password is too long." };
  return { ok: true };
}
