// POST /api/v1/auth/token — issue a bearer token for the mobile app.
//
// Auth: cookie-session via Lucia. The user signs in to the web app
// first, then the mobile app deep-links here. The route returns the
// raw token EXACTLY ONCE — the client must persist it before
// dismissing the response.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { issueToken } from "@/lib/auth/api-token";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { user } = await getSession();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { name?: string };
  try {
    body = (await req.json()) as { name?: string };
  } catch {
    body = {};
  }
  const name = String(body.name || "Mobile device").trim().slice(0, 80);
  const token = await issueToken(user.id, name, prisma);
  return NextResponse.json({
    id: token.id,
    raw: token.raw, // shown ONCE
    name: token.name,
    createdAt: token.createdAt,
  });
}
