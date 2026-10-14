// POST /mcp/oauth/revoke — token revocation (RFC 7009). Revokes the
// whole connection (every token in the family). Always 200.

import type { NextRequest } from "next/server";
import { revokeByToken } from "@/lib/mcp/oauth/tokens";
import { clientIdFrom, limitByIp, oauthJson, preflight, readParams } from "@/lib/mcp/oauth/http";

export const runtime = "nodejs";

export const OPTIONS = preflight;

export async function POST(req: NextRequest) {
  const limited = await limitByIp(req, "revoke", 60, 60_000);
  if (limited) return limited;
  const p = await readParams(req);
  if (!p) return oauthJson({ error: "invalid_request" }, 400);
  if (p.token) await revokeByToken(p.token, clientIdFrom(req, p));
  return oauthJson({});
}
