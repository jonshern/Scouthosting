// POST /mcp/oauth/token — trade an authorization code (with its PKCE
// verifier) or a refresh token for a fresh access + refresh token.
// Public clients only: the client authenticates with PKCE, not a
// secret. See lib/mcp/oauth/tokens.ts.

import type { NextRequest } from "next/server";
import { findClient } from "@/lib/mcp/oauth/clients";
import { exchangeCode, refresh } from "@/lib/mcp/oauth/tokens";
import { clientIdFrom, limitByIp, oauthJson, preflight, readParams } from "@/lib/mcp/oauth/http";
import { resourceMatches } from "@/lib/mcp/config";

export const runtime = "nodejs";

export const OPTIONS = preflight;

export async function POST(req: NextRequest) {
  const limited = await limitByIp(req, "token", 60, 60_000);
  if (limited) return limited;
  const p = await readParams(req);
  if (!p) return oauthJson({ error: "invalid_request", error_description: "Malformed body" }, 400);

  const clientId = clientIdFrom(req, p);
  const client = await findClient(clientId);
  if (!client) return oauthJson({ error: "invalid_client", error_description: "Unknown client" }, 401);
  if (p.resource && !resourceMatches(p.resource)) {
    return oauthJson({ error: "invalid_target", error_description: "Unknown resource" }, 400);
  }

  let result;
  if (p.grant_type === "authorization_code") {
    if (!p.code || !p.redirect_uri || !p.code_verifier) {
      return oauthJson({ error: "invalid_request", error_description: "code, redirect_uri and code_verifier are required" }, 400);
    }
    result = await exchangeCode({ code: p.code, clientId: client.clientId, redirectUri: p.redirect_uri, codeVerifier: p.code_verifier });
  } else if (p.grant_type === "refresh_token") {
    if (!p.refresh_token) return oauthJson({ error: "invalid_request", error_description: "refresh_token is required" }, 400);
    result = await refresh({ refreshToken: p.refresh_token, clientId: client.clientId, scope: p.scope });
  } else {
    return oauthJson({ error: "unsupported_grant_type" }, 400);
  }
  if ("error" in result) return oauthJson(result, 400);
  return oauthJson(result);
}
