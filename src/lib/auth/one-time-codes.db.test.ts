// One-time codes stay one-time when two requests use the same code at
// once. Skipped unless TEST_DATABASE_URL points at a migrated database.

import { afterAll, describe, expect, it, vi } from "vitest";
import * as OTPAuth from "otpauth";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));

import { prisma } from "@/lib/db";
import { generateBackupCodes, generateSecret, sealTotpSecret } from "./mfa";
import { verifyMfaCodeForUser } from "./mfa-verify";
import { consumeInviteCode } from "@/lib/invite";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("one-time codes under concurrency", () => {
  const tag = `otc-${Date.now()}`;
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: `-${tag}@example.invalid` } } });
    await prisma.inviteCode.deleteMany({ where: { code: { startsWith: tag.toUpperCase() } } });
  });

  async function mfaUser(label: string) {
    const secret = generateSecret();
    const user = await prisma.user.create({
      data: { email: `${label}-${tag}@example.invalid`, displayName: label, totpEnrolledAt: new Date() },
    });
    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: sealTotpSecret(secret, user.id) } });
    return { id: user.id, secret };
  }

  it("accepts a TOTP code once when two sign-ins send it together", async () => {
    const u = await mfaUser("totp");
    const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(u.secret), digits: 6, period: 30 }).generate();
    const results = await Promise.all([1, 2, 3].map(() => verifyMfaCodeForUser(u.id, code)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("accepts a backup code once", async () => {
    const u = await mfaUser("backup");
    const { plaintext, hashes } = await generateBackupCodes(1);
    await prisma.backupCode.create({ data: { userId: u.id, codeHash: hashes[0] } });
    const results = await Promise.all([1, 2, 3].map(() => verifyMfaCodeForUser(u.id, plaintext[0])));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("hands out an invite code's last use once", async () => {
    const code = `${tag.toUpperCase()}-LAST`;
    await prisma.inviteCode.create({ data: { code, maxUses: 2, usedCount: 1 } });
    const results = await Promise.all([1, 2, 3, 4].map(() => consumeInviteCode(code)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await prisma.inviteCode.findUniqueOrThrow({ where: { code } })).usedCount).toBe(2);
  });
});
