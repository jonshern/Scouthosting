// Turning an account off from the owner console, against real
// Postgres: every way in is revoked and a new session is refused.
// Runs only with TEST_DATABASE_URL set; cleans up only its own rows.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { issueToken, verifyToken } from "@/lib/auth/api-token";
import { auth } from "@/lib/auth/auth";
import { disableAccount, enableAccount } from "./access";

const db = !!process.env.TEST_DATABASE_URL;
const S = `${Date.now().toString(36)}${process.pid}`;

describe.skipIf(!db)("owner console: turning an account off", () => {
  let userId = "";
  let token = "";
  let deviceId = "";

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `off-${S}@example.invalid`, displayName: `Off ${S}`, adultAttestedAt: new Date() },
    });
    userId = user.id;
    token = (await issueToken(user.id, "Lantern app", prisma)).raw;
    await prisma.session.create({
      data: { userId, token: `sess-${S}`, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    const scout = await prisma.journeyScout.create({ data: { ownerUserId: userId, encName: Buffer.from("x") } });
    const device = await prisma.journeyScoutDevice.create({
      data: { scoutId: scout.id, tokenHash: `dev-${S}`, label: "phone", expiresAt: new Date(Date.now() + 86_400_000) },
    });
    deviceId = device.id;
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  it("signs out, revokes tokens and devices, and refuses a new session", async () => {
    const { revoked } = await disableAccount(userId, "test");
    expect(revoked).toMatchObject({ sessions: 1, appTokens: 1, scoutDevices: 1 });
    expect(await verifyToken(`Bearer ${token}`, prisma)).toBeNull();
    expect((await prisma.journeyScoutDevice.findUnique({ where: { id: deviceId } }))?.revokedAt).not.toBeNull();

    const ctx = await auth.$context;
    await expect(ctx.internalAdapter.createSession(userId)).rejects.toThrow(/account_disabled/);
  });

  it("turning it back on lets a session start again", async () => {
    await enableAccount(userId);
    const ctx = await auth.$context;
    const session = await ctx.internalAdapter.createSession(userId);
    expect(session?.userId).toBe(userId);
  });
});
