// Bearer-auth middleware for mobile API routes.
// Wraps /api/v1/* handlers; resolves the User from a `compass_pat_*`
// token via lib/auth/api-token.

import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyToken } from "./api-token";

export type AuthenticatedHandler = (
  req: NextRequest,
  ctx: { user: { id: string; email: string; displayName: string }; tokenId: string },
) => Promise<Response>;

/**
 * Wrap a route handler that requires a bearer token. Returns 401 with
 * the standard shape on missing/invalid token; otherwise calls the
 * inner handler with the resolved user attached.
 */
export function withBearerAuth(handler: AuthenticatedHandler) {
  return async function authedRoute(req: NextRequest): Promise<Response> {
    const authHeader = req.headers.get("authorization");
    const verified = await verifyToken(authHeader, prisma);
    if (!verified) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { id: verified.userId },
      select: { id: true, email: true, displayName: true },
    });
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return handler(req, { user, tokenId: verified.tokenId });
  };
}
