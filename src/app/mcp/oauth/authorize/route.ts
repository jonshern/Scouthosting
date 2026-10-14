// GET /mcp/oauth/authorize — OAuth 2.1 authorization endpoint for the
// Claude connector. Same shape as the phone sign-in (auth/mobile/begin):
// signed out → /login?next=<this URL>; signed in → the consent page,
// where the adult taps Allow. The POST below is that page's form
// (same origin + CSRF); only it mints a code.

import { NextResponse, type NextRequest } from "next/server";
import { redirectTo } from "@/lib/http/redirect";
import { getSession } from "@/lib/auth/session";
import { accountStanding, requirementRedirect, withNext } from "@/lib/auth/requirements";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { isYouthUser } from "@/lib/counselor/access";
import { checkAuthorizeRequest, errorRedirect, pickParams, toQuery } from "@/lib/mcp/oauth/authorize";
import { issueCode } from "@/lib/mcp/oauth/tokens";
import { issuer } from "@/lib/mcp/config";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

const log = logger.child("mcp-oauth");

function external(url: string, status: 302 | 303 = 302) {
  return new NextResponse(null, { status, headers: { location: url, "Cache-Control": "no-store" } });
}

export async function GET(req: NextRequest) {
  const params = pickParams((k) => req.nextUrl.searchParams.get(k));
  const query = toQuery(params);
  const check = await checkAuthorizeRequest(params);
  if (!check.ok && "redirect" in check) return external(check.redirect);
  if (!check.ok) return redirectTo(`/mcp/oauth/consent?${query}`);

  const self = `/mcp/oauth/authorize?${query}`;
  const { user } = await getSession();
  if (!user) return redirectTo(`/login?next=${encodeURIComponent(self)}`);
  const gate = requirementRedirect(await accountStanding(user.id), { organizerSurface: true });
  if (gate) return redirectTo(withNext(gate, self));
  if (await isYouthUser(user)) {
    return external(errorRedirect(check.redirectUri, "access_denied", check.state, "Only adults can connect Compass to Claude"));
  }
  return redirectTo(`/mcp/oauth/consent?${query}`);
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  if (!(await verifyOrigin()) || !(await verifyCsrf(String(form.get("_csrf") ?? "")))) {
    return NextResponse.json({ error: "bad_request" }, { status: 403 });
  }
  const params = pickParams((k) => {
    const v = form.get(k);
    return typeof v === "string" ? v : null;
  });
  const check = await checkAuthorizeRequest(params);
  if (!check.ok && "redirect" in check) return external(check.redirect, 303);
  if (!check.ok) return redirectTo(`/mcp/oauth/consent?${toQuery(params)}`, 303);

  const { user } = await getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (requirementRedirect(await accountStanding(user.id), { organizerSurface: true }) || (await isYouthUser(user))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (form.get("decision") !== "allow") {
    return external(errorRedirect(check.redirectUri, "access_denied", check.state, "The user said no"), 303);
  }

  const code = await issueCode({
    clientId: check.client.clientId,
    userId: user.id,
    redirectUri: check.redirectUri,
    codeChallenge: check.codeChallenge,
    scope: check.scope,
  });
  log.info("connector approved", { userId: user.id, clientId: check.client.clientId, scope: check.scope });
  const back = new URL(check.redirectUri);
  back.searchParams.set("code", code);
  if (check.state) back.searchParams.set("state", check.state);
  back.searchParams.set("iss", issuer());
  return external(back.toString(), 303);
}
