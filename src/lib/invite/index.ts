// Pre-launch invite-code gate. The apex marketing site is hidden
// behind a Coming Soon page until the visitor presents a valid code,
// at which point we set a signed `compass_invite` cookie that the
// middleware allows through.
//
// Cookie payload is `{codeId, exp}` signed with the existing
// SESSION_SECRET (already used by lib/security/signed-token.ts).
// We never put the raw code in the cookie — only the InviteCode.id
// — so revoking a code (via `disabledAt` or `usedCount >= maxUses`)
// kills future cookies, but issued ones stay valid until expiry.
// Bumping SESSION_SECRET invalidates everyone in one move.

import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";

export const INVITE_COOKIE = "compass_invite";
export const INVITE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const SECRET = () => process.env.SESSION_SECRET || "dev-only-not-secret-replace-in-prod-0123456789abcdef";

function sign(payload: string): string {
  return createHmac("sha256", SECRET()).update(payload).digest("base64url");
}

export function makeInviteCookie(codeId: string, now = Math.floor(Date.now() / 1000)): string {
  const exp = now + INVITE_TTL_SECONDS;
  const body = `${codeId}.${exp}`;
  return `${body}.${sign(body)}`;
}

export function readInviteCookie(raw: string | undefined | null): { codeId: string; exp: number } | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [codeId, expStr, sigB64] = parts;
  const expectedSig = sign(`${codeId}.${expStr}`);
  let sigBuf: Buffer;
  let expBuf: Buffer;
  try {
    sigBuf = Buffer.from(sigB64, "base64url");
    expBuf = Buffer.from(expectedSig, "base64url");
  } catch {
    return null;
  }
  if (sigBuf.length !== expBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expBuf)) return null;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  return { codeId, exp };
}

export type InviteValidation =
  | { ok: true; codeId: string }
  | { ok: false; reason: string };

/** Look up a code, check it's usable, and increment usedCount on success. */
export async function consumeInviteCode(rawInput: string): Promise<InviteValidation> {
  const cleaned = rawInput.trim().toUpperCase();
  if (cleaned.length === 0) return { ok: false, reason: "Enter a code." };
  if (cleaned.length > 80) return { ok: false, reason: "That doesn't look like a code." };

  const code = await prisma.inviteCode.findUnique({ where: { code: cleaned } });
  if (!code) return { ok: false, reason: "Code not recognized." };
  if (code.disabledAt) return { ok: false, reason: "Code is no longer active." };
  if (code.expiresAt && code.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "Code has expired." };
  }
  if (code.maxUses > 0 && code.usedCount >= code.maxUses) {
    return { ok: false, reason: "Code has been used up." };
  }

  await prisma.inviteCode.update({
    where: { id: code.id },
    data: { usedCount: { increment: 1 } },
  });
  return { ok: true, codeId: code.id };
}
