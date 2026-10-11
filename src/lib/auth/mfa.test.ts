import { describe, it, expect } from "vitest";
import * as OTPAuth from "otpauth";
import {
  generateSecret,
  provisioningUri,
  verifyTotp,
  generateBackupCodes,
  verifyBackupCode,
} from "./mfa";

function codeFor(secret: string, when: Date): string {
  const totp = new OTPAuth.TOTP({
    issuer: "Compass",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.generate({ timestamp: when.getTime() });
}

describe("generateSecret + provisioningUri", () => {
  it("produces a base32 secret of the expected length", () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]+$/);
    expect(s.length).toBeGreaterThanOrEqual(32);
  });

  it("generates a parseable otpauth:// URI", () => {
    const s = generateSecret();
    const uri = provisioningUri(s, "user@example.invalid");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("issuer=Compass");
    expect(uri).toContain("user%40example.invalid");
    expect(uri).toContain(`secret=${s}`);
  });
});

describe("verifyTotp", () => {
  it("round-trips a freshly generated code", () => {
    const secret = generateSecret();
    const now = new Date("2026-05-05T12:00:00Z");
    const code = codeFor(secret, now);
    const result = verifyTotp(secret, code, now);
    expect(result.ok).toBe(true);
    expect(typeof result.lastUsedWindow).toBe("number");
  });

  it("rejects a wrong code", () => {
    const secret = generateSecret();
    const now = new Date("2026-05-05T12:00:00Z");
    const result = verifyTotp(secret, "000000", now);
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed code", () => {
    const secret = generateSecret();
    expect(verifyTotp(secret, "abc", new Date()).ok).toBe(false);
    expect(verifyTotp(secret, "", new Date()).ok).toBe(false);
    expect(verifyTotp(secret, null, new Date()).ok).toBe(false);
  });

  it("rejects a replay within the same window", () => {
    const secret = generateSecret();
    const now = new Date("2026-05-05T12:00:00Z");
    const code = codeFor(secret, now);
    const first = verifyTotp(secret, code, now, null);
    expect(first.ok).toBe(true);
    const second = verifyTotp(secret, code, now, first.lastUsedWindow);
    expect(second.ok).toBe(false);
  });

  it("accepts a code from the next window after a previous accept", () => {
    const secret = generateSecret();
    const t1 = new Date("2026-05-05T12:00:00Z");
    const t2 = new Date(t1.getTime() + 30_000);
    const c1 = codeFor(secret, t1);
    const c2 = codeFor(secret, t2);
    const r1 = verifyTotp(secret, c1, t1);
    expect(r1.ok).toBe(true);
    const r2 = verifyTotp(secret, c2, t2, r1.lastUsedWindow);
    expect(r2.ok).toBe(true);
    expect(r2.lastUsedWindow).toBeGreaterThan(r1.lastUsedWindow!);
  });

  it("rejects when no secret is set", () => {
    expect(verifyTotp(null, "123456", new Date()).ok).toBe(false);
    expect(verifyTotp(undefined, "123456", new Date()).ok).toBe(false);
  });
});

describe("generateBackupCodes + verifyBackupCode", () => {
  it("generates 10 unique codes by default", async () => {
    const { plaintext, hashes } = await generateBackupCodes();
    expect(plaintext).toHaveLength(10);
    expect(hashes).toHaveLength(10);
    expect(new Set(plaintext).size).toBe(10);
    for (const code of plaintext) {
      expect(code).toMatch(/^\d{4}-\d{4}$/);
    }
  });

  it("verifies a known code at the correct index", async () => {
    const { plaintext, hashes } = await generateBackupCodes(3);
    const idx = await verifyBackupCode(hashes, plaintext[1]);
    expect(idx).toBe(1);
  });

  it("accepts the code with or without the hyphen", async () => {
    const { plaintext, hashes } = await generateBackupCodes(2);
    const flat = plaintext[0].replace("-", "");
    const idx = await verifyBackupCode(hashes, flat);
    expect(idx).toBe(0);
  });

  it("returns -1 for an unknown code", async () => {
    const { hashes } = await generateBackupCodes(2);
    expect(await verifyBackupCode(hashes, "1234-5678")).toBe(-1);
  });

  it("rejects malformed input", async () => {
    const { hashes } = await generateBackupCodes(2);
    expect(await verifyBackupCode(hashes, "abc")).toBe(-1);
    expect(await verifyBackupCode(hashes, "")).toBe(-1);
    expect(await verifyBackupCode(hashes, "1234567")).toBe(-1); // 7 digits
  });

  it("treats codes as one-shot when the caller removes the hash on use", async () => {
    const { plaintext, hashes } = await generateBackupCodes(3);
    const idx1 = await verifyBackupCode(hashes, plaintext[0]);
    expect(idx1).toBe(0);
    hashes.splice(idx1, 1);
    const idx2 = await verifyBackupCode(hashes, plaintext[0]);
    expect(idx2).toBe(-1);
  });
});

describe("TOTP secret sealing", () => {
  it("round-trips and binds the secret to its user", async () => {
    const { sealTotpSecret, openTotpSecret, isSealedTotpSecret } = await import("./mfa");
    const secret = generateSecret();
    const sealed = sealTotpSecret(secret, "user-a");
    expect(isSealedTotpSecret(sealed)).toBe(true);
    expect(sealed).not.toContain(secret);
    expect(openTotpSecret(sealed, "user-a")).toBe(secret);
    expect(() => openTotpSecret(sealed, "user-b")).toThrow();
  });

  it("reads secrets stored before sealing", async () => {
    const { openTotpSecret } = await import("./mfa");
    expect(openTotpSecret("JBSWY3DPEHPK3PXP", "user-a")).toBe("JBSWY3DPEHPK3PXP");
  });
});
