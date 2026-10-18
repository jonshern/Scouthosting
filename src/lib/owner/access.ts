// Turning an account off and on from the owner console. Off means: no
// new sign-in (the session hook in lib/auth/auth.ts refuses it),
// getSession treats any session left as signed out, and every way in
// that already exists is revoked here, in one transaction: web sessions,
// app tokens, Claude connector tokens and the scout devices paired to
// the account's Lantern trails.

import { prisma } from "@/lib/db";

export async function disableAccount(userId: string, reason: string, now: Date = new Date()) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { disabledAt: now, disabledReason: reason },
      select: { id: true, email: true },
    });
    const sessions = await tx.session.deleteMany({ where: { userId } });
    const tokens = await tx.apiToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    const mcp = await tx.mcpToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    const devices = await tx.journeyScoutDevice.updateMany({
      where: { scout: { ownerUserId: userId }, revokedAt: null },
      data: { revokedAt: now },
    });
    return {
      user,
      revoked: {
        sessions: sessions.count,
        appTokens: tokens.count,
        connectorTokens: mcp.count,
        scoutDevices: devices.count,
      },
    };
  });
}

/** Lets the account sign in again. Revoked tokens stay revoked. */
export async function enableAccount(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { disabledAt: null, disabledReason: null },
    select: { id: true, email: true },
  });
}
