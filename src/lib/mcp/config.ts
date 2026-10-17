// Where the Claude connector lives and what it may ask for.
//
// The issuer and the protected resource are built from env only, never
// from a request's Host header: tokens are bound to the resource URL,
// and OAuth metadata must say the same thing on every request.
//
//   MCP_PUBLIC_URL   the public origin Claude reaches Compass on, e.g.
//                    https://compass.example.com or a tunnel to Jon's Mac
//                    (https://jons-mac.tailnet.ts.net). Defaults to the
//                    apex origin (https://<APEX_HOST>).

import { apexPublicOrigin } from "@/lib/tenancy/resolve";

/** Read access: scouts' journeys, events, sign-offs. */
export const SCOPE_READ = "scouts:read";
/** Marking a requirement done and RSVPing. */
export const SCOPE_WRITE = "scouts:write";
export const SUPPORTED_SCOPES = [SCOPE_READ, SCOPE_WRITE] as const;
/** What a client gets when it asks for nothing in particular. */
export const DEFAULT_SCOPE = `${SCOPE_READ} ${SCOPE_WRITE}`;

export const AUTH_CODE_TTL_MS = 5 * 60_000;
export const ACCESS_TOKEN_TTL_MS = 60 * 60_000;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000;

/** The public origin, without a trailing slash. */
export function mcpOrigin(env: Record<string, string | undefined> = process.env): string {
  const configured = env.MCP_PUBLIC_URL?.trim();
  if (configured) {
    const u = new URL(configured);
    if (u.protocol !== "https:" && !isLoopback(u.hostname)) {
      throw new Error("MCP_PUBLIC_URL must be https (http only on localhost)");
    }
    return u.origin;
  }
  return apexPublicOrigin();
}

export function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

/** The OAuth issuer (RFC 8414): the origin itself. */
export const issuer = () => mcpOrigin();
/** The protected resource (RFC 8707 / 9728) every token is bound to. */
export const resourceUrl = () => `${mcpOrigin()}/mcp`;
export const resourceMetadataUrl = () => `${mcpOrigin()}/.well-known/oauth-protected-resource/mcp`;

/** Normalise a requested scope string to the supported ones, in order. */
export function normaliseScope(requested: string | null | undefined): string | null {
  if (!requested || !requested.trim()) return DEFAULT_SCOPE;
  const asked = new Set(requested.trim().split(/\s+/));
  // offline_access is how some clients ask for a refresh token; every
  // grant here comes with one, so it is accepted and dropped.
  asked.delete("offline_access");
  for (const s of asked) if (!(SUPPORTED_SCOPES as readonly string[]).includes(s)) return null;
  const out = SUPPORTED_SCOPES.filter((s) => asked.has(s));
  return out.length ? out.join(" ") : DEFAULT_SCOPE;
}

/** Does a request's `resource` parameter (optional) name this server? */
export function resourceMatches(requested: string | null | undefined): boolean {
  if (!requested) return true;
  return stripSlash(requested) === stripSlash(resourceUrl()) || stripSlash(requested) === stripSlash(mcpOrigin());
}

const stripSlash = (s: string) => s.replace(/\/+$/, "");
