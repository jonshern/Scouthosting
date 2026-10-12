// Dynamic client registration (RFC 7591) for the Claude connector.
//
// Registration is open, as MCP expects: a registered client can do
// nothing until a signed-in adult approves it on the consent page, and
// the consent page names the client and the exact redirect host. Only
// public clients (PKCE, no secret) are registered.

import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isLoopback } from "@/lib/mcp/config";

export type RegistrationError = { error: "invalid_redirect_uri" | "invalid_client_metadata"; error_description: string };

const MAX_REDIRECTS = 10;

const Metadata = z.object({
  redirect_uris: z.array(z.string().max(2000)).min(1).max(MAX_REDIRECTS),
  client_name: z.string().trim().max(120).optional(),
  client_uri: z.string().max(2000).optional(),
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  scope: z.string().max(500).optional(),
});

/**
 * A redirect URI we will send codes to: https anywhere, http only on
 * loopback (Claude Code and other local clients), or a private-use
 * scheme for native apps (RFC 8252). No fragments, no credentials.
 */
export function validRedirectUri(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === "https:") return true;
  if (u.protocol === "http:") return isLoopback(u.hostname);
  // Private-use URI scheme in reverse-domain form (RFC 8252 §7.1), e.g.
  // "com.example.app:/oauth/callback".
  // Never javascript:, data:, file: and the like.
  return /^[a-z][a-z0-9+.-]*\.[a-z0-9+.-]+:$/.test(u.protocol);
}

export type ValidRegistration = {
  clientName: string;
  clientUri: string | null;
  redirectUris: string[];
};

export function validateRegistration(body: unknown): ValidRegistration | RegistrationError {
  const parsed = Metadata.safeParse(body);
  if (!parsed.success) {
    const redirectIssue = parsed.error.issues.some((i) => i.path[0] === "redirect_uris");
    return redirectIssue
      ? { error: "invalid_redirect_uri", error_description: "redirect_uris must list 1 to 10 URIs" }
      : { error: "invalid_client_metadata", error_description: "Malformed client metadata" };
  }
  const m = parsed.data;
  const bad = m.redirect_uris.find((u) => !validRedirectUri(u));
  if (bad) return { error: "invalid_redirect_uri", error_description: `Unsupported redirect URI: ${bad.slice(0, 200)}` };
  if (m.token_endpoint_auth_method && m.token_endpoint_auth_method !== "none") {
    return { error: "invalid_client_metadata", error_description: "Only public clients (token_endpoint_auth_method none) are supported" };
  }
  if (m.grant_types && m.grant_types.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
    return { error: "invalid_client_metadata", error_description: "Only authorization_code and refresh_token grants are supported" };
  }
  if (m.response_types && m.response_types.some((r) => r !== "code")) {
    return { error: "invalid_client_metadata", error_description: "Only the code response type is supported" };
  }
  let clientUri: string | null = null;
  if (m.client_uri) {
    try {
      const u = new URL(m.client_uri);
      if (u.protocol === "https:") clientUri = u.toString();
    } catch {
      // ignore: optional and only shown as text
    }
  }
  return {
    clientName: (m.client_name || "").replace(/[\u0000-\u001f\u007f]/g, "").trim() || "Unnamed app",
    clientUri,
    redirectUris: [...new Set(m.redirect_uris)],
  };
}

export async function registerClient(reg: ValidRegistration) {
  const clientId = `mcp_${crypto.randomBytes(16).toString("hex")}`;
  const row = await prisma.mcpClient.create({
    data: { clientId, clientName: reg.clientName, clientUri: reg.clientUri, redirectUris: reg.redirectUris },
  });
  return {
    client_id: row.clientId,
    client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
    client_name: row.clientName,
    ...(row.clientUri ? { client_uri: row.clientUri } : {}),
    redirect_uris: row.redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}

export async function findClient(clientId: string | null | undefined) {
  if (!clientId || clientId.length > 100) return null;
  return prisma.mcpClient.findUnique({ where: { clientId } });
}

/** Exact string match, as OAuth 2.1 requires; loopback may vary its port (RFC 8252 §7.3). */
export function redirectAllowed(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  let req: URL;
  try {
    req = new URL(requested);
  } catch {
    return false;
  }
  if (req.protocol !== "http:" || !isLoopback(req.hostname)) return false;
  return registered.some((r) => {
    try {
      const u = new URL(r);
      return u.protocol === "http:" && u.hostname === req.hostname && u.pathname === req.pathname && u.search === req.search;
    } catch {
      return false;
    }
  });
}
