// Pre-launch invite-code gate. The apex marketing site is hidden
// behind a Coming Soon page until the visitor presents a valid code,
// at which point we set a signed `compass_invite` cookie that the
// middleware allows through.
//
// The cookie HMAC primitives live in `./cookie` (Web Crypto, edge-safe)
// so they're usable from both the middleware (Edge runtime, no
// node:crypto) and server actions (Node runtime). DB lookups are
// Node-only and live below.

import { prisma } from "@/lib/db";

export {
  INVITE_COOKIE,
  INVITE_TTL_SECONDS,
  makeInviteCookie,
  readInviteCookie,
} from "./cookie";

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
