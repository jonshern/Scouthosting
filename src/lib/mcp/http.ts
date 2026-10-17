// The /mcp endpoint: bearer auth with the connector's own access tokens,
// a per-user rate limit, then the MCP SDK's Streamable HTTP handler.
// Both protocol eras are served: 2026-07-28 per-request messages, and
// 2025-era clients through the SDK's stateless fallback.
//
// No token, or a bad one → 401 with a WWW-Authenticate header pointing
// at /.well-known/oauth-protected-resource/mcp, which is how Claude
// discovers where to sign in (RFC 9728).

import { createMcpHandler, type McpHttpHandler } from "@modelcontextprotocol/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/log";
import { rateLimit } from "@/lib/security/rate-limit";
import { SUPPORTED_SCOPES, resourceMetadataUrl, resourceUrl } from "./config";
import { verifyAccessToken } from "./oauth/tokens";
import { CORS } from "./oauth/http";
import { buildMcpServer } from "./server";
import type { McpUser } from "./scouts";

const log = logger.child("mcp");

/** Tool calls per adult per minute, across all their connections. */
export const MCP_USER_LIMIT = { limit: 120, windowMs: 60_000 };

let handler: McpHttpHandler | null = null;

function mcpHandler(): McpHttpHandler {
  handler ??= createMcpHandler(
    (ctx) => {
      const extra = ctx.authInfo?.extra as { user?: McpUser } | undefined;
      if (!extra?.user) throw new Error("mcp: request reached the server without a verified user");
      return buildMcpServer({ user: extra.user, scopes: ctx.authInfo?.scopes ?? [] });
    },
    {
      legacy: "stateless",
      responseMode: "json",
      maxRequestBodySize: 256 * 1024,
      onerror: (err) => log.warn("mcp transport error", { err: err.message }),
    },
  );
  return handler;
}

function challenge(status: 401 | 403, error?: string, description?: string): Response {
  const params = [
    `resource_metadata="${resourceMetadataUrl()}"`,
    `scope="${SUPPORTED_SCOPES.join(" ")}"`,
    ...(error ? [`error="${error}"`] : []),
    ...(description ? [`error_description="${description}"`] : []),
  ];
  return new Response(JSON.stringify({ error: error ?? "unauthorized" }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "WWW-Authenticate": `Bearer ${params.join(", ")}`,
      ...CORS,
    },
  });
}

export async function handleMcp(req: Request): Promise<Response> {
  const verified = await verifyAccessToken(req.headers.get("authorization"));
  if (!verified) {
    const sent = !!req.headers.get("authorization");
    return challenge(401, sent ? "invalid_token" : undefined, sent ? "The access token is missing, expired or revoked" : undefined);
  }
  const user = await prisma.user.findUnique({
    where: { id: verified.userId },
    select: { id: true, email: true, displayName: true },
  });
  if (!user) return challenge(401, "invalid_token", "Unknown user");

  const r = await rateLimit(`mcp:user:${user.id}`, MCP_USER_LIMIT.limit, MCP_USER_LIMIT.windowMs);
  if (!r.ok) {
    const retry = String(Math.max(1, Math.ceil(r.resetMs / 1000)));
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": retry, ...CORS },
    });
  }

  const res = await mcpHandler().fetch(req, {
    authInfo: {
      token: "",
      clientId: verified.clientId,
      scopes: verified.scopes,
      expiresAt: Math.floor(verified.expiresAt.getTime() / 1000),
      resource: new URL(resourceUrl()),
      extra: { user },
    },
  });
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
