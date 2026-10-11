// POST /api/events/[slug]/signups — public merit badge day sign-up
// from Waypoint (see lib/events/public-signup for the rules).
//
// No sign-in and no cookies are read, so there's no ambient credential
// for a cross-site request to borrow. Requiring a JSON content type
// means a browser on another origin must send a CORS preflight, which
// this route never approves, so plain HTML forms elsewhere can't post
// here; the native app isn't subject to CORS. Limited per client IP
// and per guardian email in Postgres (RateLimitBucket).
//
// 200 { status: "confirmed" | "waitlisted", waitlistedStationIds?, waitlistedVolunteerRoles? }
// errors: { error: "<code>", message: "<for people>", ... }

import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, json, readJson } from "@/lib/api/v1";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientIpFromHeaders } from "@/lib/security/client-ip";
import { logger } from "@/lib/log";
import {
  PublicSlugSchema,
  SIGNUP_LIMITS,
  SignupBodySchema,
  SignupError,
  submitPublicSignup,
} from "@/lib/events/public-signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = logger.child("public-signup");

const MESSAGES: Record<string, string> = {
  bad_json: "The request wasn't valid JSON.",
  too_large: "The request is too large.",
};

function fail(status: number, error: string, message: string, extra: Record<string, unknown> = {}, headers?: Record<string, string>) {
  return json({ error, message, ...extra }, { status, headers });
}

async function limited(key: string, l: { limit: number; windowMs: number }): Promise<Response | null> {
  const r = await rateLimit(key, l.limit, l.windowMs);
  if (r.ok) return null;
  const retryAfter = Math.max(1, Math.ceil(r.resetMs / 1000));
  return fail(
    429,
    "rate_limited",
    "Too many sign-ups from here. Wait a few minutes and try again.",
    { retryAfter },
    { "Retry-After": String(retryAfter) },
  );
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  try {
    const tooMany = await limited(`signup:ip:${clientIpFromHeaders(req.headers)}`, SIGNUP_LIMITS.ip);
    if (tooMany) return tooMany;

    const contentType = req.headers.get("content-type") ?? "";
    if (!/^application\/json\b/i.test(contentType)) {
      return fail(415, "unsupported_media_type", "Send the sign-up as JSON.");
    }

    const slug = PublicSlugSchema.safeParse((await ctx.params).slug);
    if (!slug.success) return fail(404, "event_not_found", "That event isn't taking sign-ups here.");

    const body = await readJson(req, SignupBodySchema);

    const perEmail = await limited(`signup:email:${body.guardian.email}`, SIGNUP_LIMITS.email);
    if (perEmail) return perEmail;

    const result = await submitPublicSignup(prisma, slug.data, body);
    return json(result);
  } catch (err) {
    if (err instanceof SignupError) return fail(err.status, err.code, err.message, err.extra);
    if (err instanceof ZodError) {
      return fail(400, "invalid_request", err.issues[0]?.message ?? "Check the form and try again.", {
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    if (err instanceof ApiError) {
      return fail(err.status, err.code, MESSAGES[err.code] ?? "The request couldn't be read.", err.extra);
    }
    log.error("public sign-up failed", { err });
    return fail(500, "internal", "Something went wrong on our side. Try again in a minute.");
  }
}
