// GET /t/c/[token]?to=<encoded-url> — click-tracking redirect.
// Verifies the token (URL hash matches embedded), records a
// MailEvent kind="click", then 302s to the destination.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyTrackingToken } from "@/lib/tracking/click-token";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.pathname.split("/").pop() ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  if (!to) return NextResponse.json({ error: "missing_destination" }, { status: 400 });

  const claims = verifyTrackingToken(token, { url: to });
  if (!claims || claims.kind !== "click") {
    // Bad/expired token — still redirect to the destination so the
    // recipient isn't punished for our token expiry. Just don't
    // record the event.
    return NextResponse.redirect(to);
  }

  // MailEvent requires orgId — read it off the parent MailLog.
  prisma.mailLog
    .findUnique({ where: { id: claims.mailLogId }, select: { orgId: true } })
    .then((log) => {
      if (!log) return;
      return prisma.mailEvent.create({
        data: {
          orgId: log.orgId,
          mailLogId: claims.mailLogId,
          recipient: claims.recipient,
          kind: "click",
          url: to,
        },
      });
    })
    .catch(() => {});

  return NextResponse.redirect(to);
}
