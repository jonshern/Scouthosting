// POST /api/events/staff-rsvp — answer a staff invite from the emailed
// link, no sign-in. Body: { token, status: "yes" | "no" | "maybe",
// notes? } → { staff: { id, status } }. The token is the only
// credential, so it's rate-limited per client IP and per token, and an
// unknown token is a plain 404 { error: "invalid_token" }.

import type { NextRequest } from "next/server";
import { ApiError, errorResponse, json, readJson } from "@/lib/api/v1";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/client-ip";
import { TokenRsvpSchema, hashStaffToken, respondByToken } from "@/lib/events/staff";

export const runtime = "nodejs";

const MINUTE = 60_000;
export const STAFF_RSVP_LIMITS = {
  ip: { limit: 20, windowMs: MINUTE },
  token: { limit: 10, windowMs: 10 * MINUTE },
};

async function enforce(key: string, limit: number, windowMs: number) {
  const r = await rateLimit(key, limit, windowMs);
  if (!r.ok) {
    const retryAfter = Math.max(1, Math.ceil(r.resetMs / 1000));
    throw new ApiError(429, "rate_limited", { retryAfter }, { "Retry-After": String(retryAfter) });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const ip = clientIp(req.headers);
    if (ip) await enforce(`staff-rsvp:ip:${ip}`, STAFF_RSVP_LIMITS.ip.limit, STAFF_RSVP_LIMITS.ip.windowMs);
    const input = await readJson(req, TokenRsvpSchema);
    await enforce(
      `staff-rsvp:token:${hashStaffToken(input.token).slice(0, 32)}`,
      STAFF_RSVP_LIMITS.token.limit,
      STAFF_RSVP_LIMITS.token.windowMs,
    );
    const staff = await respondByToken(input.token, input.status, input.notes);
    return json({ staff });
  } catch (err) {
    return errorResponse(err);
  }
}
