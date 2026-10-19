// POST /api/v1/usage — page and screen views, and key actions, from the
// landing page, Compass, Waypoint and Lantern, for the owner console's
// usage pages (/super-admin/analytics). Works signed out. A Compass or
// adult bearer token ties the events to that account. Nothing is kept
// from a scout's device or account. Compass's own pages are matched to
// the signed-in session.
//
// { product, platform?, role?: "scout", events: [{ name, path?,
//   referrer?, source?, props? }] }  →  { ok: true }
//
// The landing page posts with navigator.sendBeacon, which sends
// text/plain and no preflight, so the body is read as text. A browser
// sending Do Not Track or Global Privacy Control is answered but not
// recorded, and so are crawlers and test browsers. Past 240 events a
// minute from one address the rest are dropped, still with a 200.

import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, badRequest, json, v1PublicRoute } from "@/lib/api/v1";
import { verifyToken } from "@/lib/auth/api-token";
import { getSession } from "@/lib/auth/session";
import { resolveOrgFromHost } from "@/lib/tenancy/resolve";
import { requireScoutDevice } from "@/lib/journey/devices";
import { rateLimit } from "@/lib/security/rate-limit";
import { ingest, type Who } from "@/lib/usage/collect";
import { isBot, NAME_RE, USAGE_PLATFORMS, USAGE_PRODUCTS } from "@/lib/usage/events";

export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "600",
};

const Event = z.object({
  name: z.string().regex(NAME_RE, "bad_name"),
  path: z.string().max(500).nullish(),
  referrer: z.string().max(500).nullish(),
  source: z.string().max(100).nullish(),
  props: z.record(z.unknown()).nullish(),
});

const Body = z.object({
  product: z.enum(USAGE_PRODUCTS, { errorMap: () => ({ message: "bad_product" }) }),
  platform: z.enum(USAGE_PLATFORMS).default("web"),
  role: z.literal("scout").optional(),
  events: z.array(Event).min(1).max(20),
});

const MAX_BYTES = 16 * 1024;

async function readBody(req: NextRequest) {
  const text = await req.text().catch(() => "");
  if (Buffer.byteLength(text) > MAX_BYTES) throw new ApiError(413, "too_large");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw badRequest("bad_json");
  }
  return Body.parse(raw);
}

async function isScoutOnly(userId: string): Promise<boolean> {
  const roles = await prisma.orgMembership.findMany({ where: { userId }, select: { role: true } });
  return roles.length > 0 && roles.every((r) => r.role === "scout");
}

async function whoIsAsking(req: NextRequest, product: string): Promise<Who> {
  const auth = req.headers.get("authorization");
  if (auth && /^Bearer\s+lantern_scout_/i.test(auth)) {
    const device = await requireScoutDevice(req).catch(() => null);
    return { role: "scout", scoutId: device?.scoutId ?? null };
  }
  if (auth) {
    const verified = await verifyToken(auth, prisma).catch(() => null);
    if (verified) return { role: (await isScoutOnly(verified.userId)) ? "scout" : "adult", userId: verified.userId };
    return { role: "visitor" };
  }
  // Compass's own pages carry its session cookie. Other products'
  // websites share a host with Compass on the Mac, so their cookie
  // isn't theirs to read.
  if (product === "compass") {
    const { user } = await getSession().catch(() => ({ user: null }));
    if (user) return { role: (await isScoutOnly(user.id)) ? "scout" : "adult", userId: user.id };
  }
  return { role: "visitor" };
}

// The address used only for the day's visitor hash. With no trusted
// client-IP header (the Mac), the last proxy hop is good enough for
// counting: a spoofed one only skews a count, it never grants anything.
function countingIp(req: NextRequest, trusted: string | null): string | null {
  if (trusted) return trusted;
  const xff = req.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return xff?.[xff.length - 1] || req.headers.get("x-real-ip") || null;
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export const POST = v1PublicRoute(
  async (req, { ip }) => {
    const ok = json({ ok: true }, { headers: CORS });
    const ua = req.headers.get("user-agent");
    if (req.headers.get("sec-gpc") === "1" || req.headers.get("dnt") === "1" || isBot(ua)) return ok;

    const input = await readBody(req);
    // Over the limit, the events are dropped but the answer is still OK:
    // an error here would only show up in the visitor's browser console.
    const counted = countingIp(req, ip);
    const limit = await rateLimit(`usage:${counted ?? "unknown"}`, counted ? 240 : 2400, 60_000);
    if (!limit.ok) return ok;
    // Nothing is recorded from a scout: a Lantern scout device, a
    // scout's own account, or Lantern outside grown-up mode (it says
    // role "scout" then, even on a parent's signed-in phone).
    if (input.role === "scout") return ok;
    const who = await whoIsAsking(req, input.product);
    if (who.role === "scout") return ok;
    const host = req.headers.get("host");
    if (input.product === "compass" && !who.orgId) {
      const org = await resolveOrgFromHost(host).catch(() => null);
      if (org) who.orgId = org.id;
    }
    await ingest(input.events, { product: input.product, platform: input.platform, ip: counted, userAgent: ua, host }, who);
    return ok;
  },
);
