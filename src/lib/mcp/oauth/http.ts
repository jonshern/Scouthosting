// Small HTTP helpers for the connector's OAuth endpoints: JSON with
// no-store, CORS for browser-based MCP clients (tokens and metadata
// are not cookie-authenticated, so a wildcard origin leaks nothing),
// per-IP limits, and form/JSON body reading.

import type { NextRequest } from "next/server";
import { clientIp } from "@/lib/security/client-ip";
import { rateLimit } from "@/lib/security/rate-limit";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
  "Access-Control-Max-Age": "600",
};

export function oauthJson(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Pragma: "no-cache", ...CORS, ...extra },
  });
}

export const preflight = () => new Response(null, { status: 204, headers: CORS });

/**
 * Per-IP budget; null when allowed, else the 429 to return. When the
 * platform's client-IP header isn't trusted there is no IP to key on:
 * `unknownIp` then names one shared budget (or skips the limit).
 */
export async function limitByIp(
  req: NextRequest,
  bucket: string,
  limit: number,
  windowMs: number,
  unknownIp?: { limit: number },
): Promise<Response | null> {
  const ip = clientIp(req.headers);
  if (!ip && !unknownIp) return null;
  const r = await rateLimit(`mcp:${bucket}:${ip ?? "shared"}`, ip ? limit : unknownIp!.limit, windowMs);
  if (r.ok) return null;
  const retry = String(Math.max(1, Math.ceil(r.resetMs / 1000)));
  return oauthJson({ error: "slow_down", error_description: "Too many requests" }, 429, { "Retry-After": retry });
}

const MAX_BODY = 16 * 1024;

/** Token and revocation requests are form-encoded (RFC 6749); accept JSON too. */
export async function readParams(req: NextRequest): Promise<Record<string, string> | null> {
  const text = await req.text().catch(() => null);
  if (text === null || text.length > MAX_BODY) return null;
  const type = req.headers.get("content-type") ?? "";
  const out: Record<string, string> = {};
  if (type.includes("application/json")) {
    try {
      const raw = JSON.parse(text || "{}");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      for (const [k, v] of Object.entries(raw)) if (typeof v === "string") out[k] = v;
    } catch {
      return null;
    }
    return out;
  }
  new URLSearchParams(text).forEach((v, k) => {
    if (!(k in out)) out[k] = v;
  });
  return out;
}

/** client_id from the body, or from HTTP Basic (with an empty secret) for clients that send it that way. */
export function clientIdFrom(req: NextRequest, params: Record<string, string>): string | null {
  if (params.client_id) return params.client_id;
  const m = req.headers.get("authorization")?.match(/^Basic\s+(\S+)$/i);
  if (!m) return null;
  try {
    const decoded = Buffer.from(m[1], "base64").toString("utf8");
    return decodeURIComponent(decoded.split(":")[0] ?? "") || null;
  } catch {
    return null;
  }
}
