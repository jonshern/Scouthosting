// TOTP + backup-code helpers. The browser-side QR rendering and the
// Express handler wiring are exercised in integration; this file
// pins the verification math and the replay-protection behavior.

import { describe, it, expect } from "vitest";
import * as OTPAuth from "otpauth";
import {
  buildEnrollmentArtifacts,
  verifyTotp,
  mintBackupCodes,
  verifyBackupCode,
  mintPreMfaToken,
  verifyPreMfaToken,
} from "../lib/mfa.js";
import { makeSignedToken } from "../lib/signedToken.js";

const SECRET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; // canonical RFC 4648 base32

function codeFor(secret, atMs) {
  const totp = new OTPAuth.TOTP({
    issuer: "Compass",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.generate({ timestamp: atMs });
}

describe("buildEnrollmentArtifacts", () => {
  it("returns a base32 secret + an otpauth:// URI + a data-URL QR code", async () => {
    const artifacts = await buildEnrollmentArtifacts({ userEmail: "alice@example.invalid" });
    expect(artifacts.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(artifacts.uri).toMatch(/^otpauth:\/\/totp\//);
    expect(artifacts.uri).toContain("issuer=Compass");
    expect(artifacts.uri).toContain("alice%40example.invalid");
    expect(artifacts.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("returns a fresh secret on each call", async () => {
    const a = await buildEnrollmentArtifacts({ userEmail: "x@y" });
    const b = await buildEnrollmentArtifacts({ userEmail: "x@y" });
    expect(a.secret).not.toBe(b.secret);
  });
});

describe("verifyTotp", () => {
  const NOW = new Date("2026-05-03T12:00:00Z");
  const period = 30000;
  const periodStart = Math.floor(NOW.getTime() / period) * period;

  it("accepts the current 30s window's code", () => {
    const code = codeFor(SECRET, NOW.getTime());
    const r = verifyTotp({ secret: SECRET, token: code, now: NOW });
    expect(r.ok).toBe(true);
    expect(r.periodStart.getTime()).toBe(periodStart);
  });

  it("accepts a code from the previous window (clock-skew tolerance)", () => {
    const code = codeFor(SECRET, NOW.getTime() - period);
    const r = verifyTotp({ secret: SECRET, token: code, now: NOW });
    expect(r.ok).toBe(true);
  });

  it("accepts a code from the next window (clock-skew tolerance)", () => {
    const code = codeFor(SECRET, NOW.getTime() + period);
    const r = verifyTotp({ secret: SECRET, token: code, now: NOW });
    expect(r.ok).toBe(true);
  });

  it("rejects a wrong code", () => {
    const r = verifyTotp({ secret: SECRET, token: "000000", now: NOW });
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a malformed code (not 6 digits)", () => {
    expect(verifyTotp({ secret: SECRET, token: "12345", now: NOW })).toEqual({ ok: false, reason: "invalid" });
    expect(verifyTotp({ secret: SECRET, token: "abcdef", now: NOW })).toEqual({ ok: false, reason: "invalid" });
    expect(verifyTotp({ secret: SECRET, token: "", now: NOW })).toEqual({ ok: false, reason: "invalid" });
  });

  it("strips whitespace before verifying (apps add spaces in the display)", () => {
    const code = codeFor(SECRET, NOW.getTime());
    const r = verifyTotp({ secret: SECRET, token: `${code.slice(0, 3)} ${code.slice(3)}`, now: NOW });
    expect(r.ok).toBe(true);
  });

  it("returns no-secret when the user hasn't enrolled", () => {
    expect(verifyTotp({ secret: null, token: "123456" })).toEqual({ ok: false, reason: "no-secret" });
  });

  it("rejects replay within the same window via lastUsedAt", () => {
    const code = codeFor(SECRET, NOW.getTime());
    const first = verifyTotp({ secret: SECRET, token: code, lastUsedAt: null, now: NOW });
    expect(first.ok).toBe(true);
    // lastUsedAt now equals first.periodStart — second attempt at the
    // same code in the same window should bounce.
    const replay = verifyTotp({
      secret: SECRET, token: code,
      lastUsedAt: first.periodStart, now: NOW,
    });
    expect(replay).toEqual({ ok: false, reason: "replay" });
  });

  it("a code from the next window is fine even with a recent lastUsedAt", () => {
    const codeNow = codeFor(SECRET, NOW.getTime());
    const first = verifyTotp({ secret: SECRET, token: codeNow, now: NOW });
    expect(first.ok).toBe(true);
    const later = new Date(NOW.getTime() + period);
    const codeLater = codeFor(SECRET, later.getTime());
    const r = verifyTotp({
      secret: SECRET, token: codeLater,
      lastUsedAt: first.periodStart, now: later,
    });
    expect(r.ok).toBe(true);
  });
});

describe("mintBackupCodes", () => {
  it("mints the requested number of distinct codes", async () => {
    const { codes, rows } = await mintBackupCodes({ userId: "u1", count: 10 });
    expect(codes).toHaveLength(10);
    expect(rows).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
  });

  it("formats codes as 4-4 hyphenated 8-digit numerics", async () => {
    const { codes } = await mintBackupCodes({ userId: "u1", count: 5 });
    for (const c of codes) expect(c).toMatch(/^\d{4}-\d{4}$/);
  });

  it("hashes the codes (rows carry codeHash, never the plaintext)", async () => {
    const { codes, rows } = await mintBackupCodes({ userId: "u1", count: 3 });
    for (let i = 0; i < codes.length; i++) {
      expect(rows[i].codeHash).not.toContain(codes[i]);
      expect(rows[i].codeHash).toMatch(/^\$argon2id\$/);
      expect(rows[i].userId).toBe("u1");
    }
  });
});

describe("verifyBackupCode", () => {
  function fakePrismaWithCode(plaintextCodes, hashes) {
    return {
      backupCode: {
        async findMany({ where }) {
          // Return only unused codes, simulating the where clause.
          const out = [];
          for (let i = 0; i < hashes.length; i++) {
            if (where.userId === "u1") out.push({ id: `c${i}`, codeHash: hashes[i] });
          }
          return out;
        },
      },
    };
  }

  it("returns the matching row id when a plaintext code matches", async () => {
    const { codes, rows } = await mintBackupCodes({ userId: "u1", count: 3 });
    const prisma = fakePrismaWithCode(codes, rows.map((r) => r.codeHash));
    const id = await verifyBackupCode({ userId: "u1", code: codes[1], prismaClient: prisma });
    expect(id).toBe("c1");
  });

  it("strips hyphens / spaces (user can type either form)", async () => {
    const { codes, rows } = await mintBackupCodes({ userId: "u1", count: 3 });
    const prisma = fakePrismaWithCode(codes, rows.map((r) => r.codeHash));
    const stripped = codes[0].replace(/-/g, "");
    expect(await verifyBackupCode({ userId: "u1", code: stripped, prismaClient: prisma })).toBe("c0");
    expect(await verifyBackupCode({ userId: "u1", code: codes[0].replace("-", " "), prismaClient: prisma })).toBe("c0");
  });

  it("returns null on no-match", async () => {
    const { codes, rows } = await mintBackupCodes({ userId: "u1", count: 3 });
    const prisma = fakePrismaWithCode(codes, rows.map((r) => r.codeHash));
    expect(await verifyBackupCode({ userId: "u1", code: "0000-0000", prismaClient: prisma })).toBeNull();
  });

  it("rejects malformed input (not 8 digits)", async () => {
    const prisma = fakePrismaWithCode([], []);
    expect(await verifyBackupCode({ userId: "u1", code: "abc", prismaClient: prisma })).toBeNull();
    expect(await verifyBackupCode({ userId: "u1", code: "1234567", prismaClient: prisma })).toBeNull();
    expect(await verifyBackupCode({ userId: "u1", code: "", prismaClient: prisma })).toBeNull();
  });
});

describe("pre-MFA token", () => {
  const SECRET_KEY = "test-secret-key";

  it("round-trips userId through mint + verify", () => {
    const tok = mintPreMfaToken({ userId: "user-123", secret: SECRET_KEY });
    expect(verifyPreMfaToken(tok, { secret: SECRET_KEY })).toBe("user-123");
  });

  it("rejects a token signed with a different secret", () => {
    const tok = mintPreMfaToken({ userId: "user-123", secret: SECRET_KEY });
    expect(verifyPreMfaToken(tok, { secret: "wrong" })).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifyPreMfaToken("not-a-token", { secret: SECRET_KEY })).toBeNull();
    expect(verifyPreMfaToken("", { secret: SECRET_KEY })).toBeNull();
  });

  it("rejects a token of the wrong kind (cross-token confusion)", () => {
    // A reset/magic-link token signed with the same secret must NOT
    // pass verifyPreMfaToken — kind discrimination is what stops a
    // password-reset token from being smuggled into the second-factor
    // gate.
    const resetToken = makeSignedToken(
      { kind: "reset", uid: "u1" },
      { secret: SECRET_KEY, ttlSeconds: 60 },
    );
    expect(verifyPreMfaToken(resetToken, { secret: SECRET_KEY })).toBeNull();
  });
});
