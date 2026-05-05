// POST /api/v1/support { subject, body, context? } — file a
// SupportTicket from the mobile app's "Contact support" surface.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withBearerAuth } from "@/lib/auth/api-bearer";

export const runtime = "nodejs";

export const POST = withBearerAuth(async (req: NextRequest, { user }) => {
  let body: { subject?: string; body?: string; context?: Record<string, unknown> };
  try {
    body = (await req.json()) as never;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const subject = String(body.subject ?? "").trim().slice(0, 200);
  const text = String(body.body ?? "").trim().slice(0, 8000);
  if (!subject || !text) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // SupportTicket requires orgId — pick the user's first membership
  // (mobile sends from inside an active org context).
  const m = await prisma.orgMembership.findFirst({
    where: { userId: user.id },
    select: { orgId: true },
  });
  if (!m) return NextResponse.json({ error: "no_org" }, { status: 400 });

  const ticket = await prisma.supportTicket.create({
    data: {
      orgId: m.orgId,
      userId: user.id,
      fromEmail: user.email,
      fromName: user.displayName,
      subject,
      body: text,
      status: "open",
    },
  });
  return NextResponse.json({ id: ticket.id });
});
