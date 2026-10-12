// RFC 9728 metadata for the /mcp resource. See lib/mcp/oauth/metadata.ts.
import { protectedResourceMetadata } from "@/lib/mcp/oauth/metadata";
import { oauthJson, preflight } from "@/lib/mcp/oauth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;
export const GET = () => oauthJson(protectedResourceMetadata());
