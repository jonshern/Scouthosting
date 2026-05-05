// POST /api/v1/push/unregister — soft-retire a device. Body: { token }.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withBearerAuth } from "@/lib/auth/api-bearer";

export const runtime = "nodejs";

export const POST = withBearerAuth(async (req: NextRequest, { user }) => {
  let body: { token?: string };
  try {
    body = (await req.json()) as never;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const token = String(body.token || "").trim();
  if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 });
  const row = await prisma.pushDevice.findUnique({ where: { token } });
  if (!row || row.userId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  await prisma.pushDevice.update({
    where: { token },
    data: { retiredAt: new Date(), retiredReason: "user_unregistered" },
  });
  return NextResponse.json({ ok: true });
});
