// /mcp — the Compass MCP server (Claude connector). See src/lib/mcp/
// and docs/mcp.md.

import { handleMcp } from "@/lib/mcp/http";
import { preflight } from "@/lib/mcp/oauth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = (req: Request) => handleMcp(req);
export const GET = (req: Request) => handleMcp(req);
export const DELETE = (req: Request) => handleMcp(req);
export const OPTIONS = preflight;
