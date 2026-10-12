// Same document at the root, for clients that look there first.
import { protectedResourceMetadata } from "@/lib/mcp/oauth/metadata";
import { oauthJson, preflight } from "@/lib/mcp/oauth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = preflight;
export const GET = () => oauthJson(protectedResourceMetadata());
