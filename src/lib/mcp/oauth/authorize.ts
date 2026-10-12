// Checks an OAuth authorization request (/mcp/oauth/authorize). Shared
// by the GET route, the consent page and the consent form's POST, so
// all three agree on what is allowed.
//
// Until the client and redirect_uri are known good, errors are shown
// on our own page (never redirected: an unchecked redirect_uri is an
// open redirect). After that, errors go back to the client as
// ?error=... on its redirect_uri, per RFC 6749 §4.1.2.1.

import { findClient, redirectAllowed } from "./clients";
import { validChallenge } from "./tokens";
import { issuer, normaliseScope, resourceMatches } from "@/lib/mcp/config";

export const AUTHORIZE_PARAMS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "scope",
  "state",
  "code_challenge",
  "code_challenge_method",
  "resource",
] as const;

export type AuthorizeParams = Partial<Record<(typeof AUTHORIZE_PARAMS)[number], string>>;

export type AuthorizeCheck =
  | { ok: true; client: { clientId: string; clientName: string; clientUri: string | null }; redirectUri: string; scope: string; state: string | null; codeChallenge: string }
  /** Show this on our own page; don't redirect anywhere. */
  | { ok: false; show: string }
  /** Send the client back to redirect_uri with this error. */
  | { ok: false; redirect: string };

export function pickParams(get: (k: string) => string | null | undefined): AuthorizeParams {
  const out: AuthorizeParams = {};
  for (const k of AUTHORIZE_PARAMS) {
    const v = get(k);
    if (typeof v === "string" && v.length <= 2000) out[k] = v;
  }
  return out;
}

/** The query string that reproduces these params (for /login?next= and the consent page). */
export function toQuery(p: AuthorizeParams): string {
  const q = new URLSearchParams();
  for (const k of AUTHORIZE_PARAMS) if (p[k] !== undefined) q.set(k, p[k]!);
  return q.toString();
}

export function errorRedirect(redirectUri: string, error: string, state: string | null | undefined, description?: string): string {
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  if (description) u.searchParams.set("error_description", description);
  if (state) u.searchParams.set("state", state);
  u.searchParams.set("iss", issuer());
  return u.toString();
}

export async function checkAuthorizeRequest(p: AuthorizeParams): Promise<AuthorizeCheck> {
  const client = await findClient(p.client_id);
  if (!client) return { ok: false, show: "This app isn't registered with Compass. Try adding the connector again." };
  if (!p.redirect_uri || !redirectAllowed(client.redirectUris, p.redirect_uri)) {
    return { ok: false, show: "This app asked to send you somewhere it didn't register. Nothing was shared." };
  }
  const back = (error: string, d: string) => ({ ok: false as const, redirect: errorRedirect(p.redirect_uri!, error, p.state, d) });

  if (p.response_type !== "code") return back("unsupported_response_type", "Only response_type=code is supported");
  if (!validChallenge(p.code_challenge) || p.code_challenge_method !== "S256") {
    return back("invalid_request", "PKCE with code_challenge_method=S256 is required");
  }
  if (!resourceMatches(p.resource)) return back("invalid_target", "Unknown resource");
  const scope = normaliseScope(p.scope);
  if (!scope) return back("invalid_scope", "Unsupported scope");

  return {
    ok: true,
    client: { clientId: client.clientId, clientName: client.clientName, clientUri: client.clientUri },
    redirectUri: p.redirect_uri,
    scope,
    state: p.state ?? null,
    codeChallenge: p.code_challenge,
  };
}
