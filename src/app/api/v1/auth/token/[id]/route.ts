// DELETE /api/v1/auth/token/[id] — revoke a bearer token. Auth via
// the bearer token itself (you can revoke the one you used to call
// this, which logs you out cleanly).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withBearerAuth } from "@/lib/auth/api-bearer";
import { revokeToken } from "@/lib/auth/api-token";

export const runtime = "nodejs";

export const DELETE = withBearerAuth(async (req, { user }) => {
  const id = req.nextUrl.pathname.split("/").pop() ?? "";
  const row = await prisma.apiToken.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!row || row.userId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  await revokeToken(id, prisma);
  return NextResponse.json({ ok: true });
});
