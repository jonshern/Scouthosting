// POST /mcp/oauth/register — dynamic client registration (RFC 7591).
// Claude registers itself here the first time the connector is added.
// See lib/mcp/oauth/clients.ts for what is accepted.

import type { NextRequest } from "next/server";
import { registerClient, validateRegistration } from "@/lib/mcp/oauth/clients";
import { limitByIp, oauthJson, preflight } from "@/lib/mcp/oauth/http";

export const runtime = "nodejs";

const HOUR = 60 * 60_000;

export const OPTIONS = preflight;

export async function POST(req: NextRequest) {
  const limited = await limitByIp(req, "register", 20, HOUR, { limit: 200 });
  if (limited) return limited;
  const text = await req.text().catch(() => "");
  if (text.length > 16 * 1024) return oauthJson({ error: "invalid_client_metadata", error_description: "Too large" }, 400);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return oauthJson({ error: "invalid_client_metadata", error_description: "Body must be JSON" }, 400);
  }
  const reg = validateRegistration(body);
  if ("error" in reg) return oauthJson(reg, 400);
  return oauthJson(await registerClient(reg), 201);
}
