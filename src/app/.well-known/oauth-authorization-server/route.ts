// RFC 8414 metadata for the connector's authorization server. See
// lib/mcp/oauth/metadata.ts.
import { authorizationServerMetadata } from "@/lib/mcp/oauth/metadata";
import { oauthJson, preflight } from "@/lib/mcp/oauth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;
export const GET = () => oauthJson(authorizationServerMetadata());
