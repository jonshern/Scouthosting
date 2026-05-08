// POST handler for the public permission slip signing form. Verifies
// the token, captures IP + signed name, upserts a PermissionSlip
// keyed on (eventId, memberId). Resigning overwrites — the latest
// signature wins. We snapshot the slipText at submit time so future
// edits to the event's consent language don't retroactively change
// what the parent agreed to.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPermSlipToken } from "@/lib/security/perm-slip-token";
import { effectiveSlipText } from "@/lib/permission-slips";

function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const claims = verifyPermSlipToken(token);
  if (!claims) {
    return NextResponse.redirect(new URL(`/permission-slip/${token}?error=expired`, req.url), 303);
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.redirect(new URL(`/permission-slip/${token}?error=invalid`, req.url), 303);
  }
  const signedByName = String(form.get("signedByName") ?? "").trim().slice(0, 200);
  const notes = String(form.get("notes") ?? "").trim().slice(0, 2000) || null;
  if (!signedByName) {
    return NextResponse.redirect(
      new URL(`/permission-slip/${token}?error=Please+type+your+name`, req.url),
      303,
    );
  }

  const event = await prisma.event.findUnique({
    where: { id: claims.eventId },
    select: { id: true, orgId: true, permissionSlipText: true },
  });
  if (!event || event.orgId !== claims.orgId) {
    return NextResponse.redirect(new URL(`/permission-slip/${token}?error=missing`, req.url), 303);
  }

  const slipTextSnapshot = effectiveSlipText(event.permissionSlipText);
  const ip = clientIp(req);

  await prisma.permissionSlip.upsert({
    where: { eventId_memberId: { eventId: event.id, memberId: claims.memberId } },
    create: {
      orgId: event.orgId,
      eventId: event.id,
      memberId: claims.memberId,
      signedByName,
      signedByEmail: claims.parentEmail,
      signedIp: ip,
      slipTextSnapshot,
      notes,
    },
    update: {
      signedByName,
      signedByEmail: claims.parentEmail,
      signedAt: new Date(),
      signedIp: ip,
      slipTextSnapshot,
      notes,
    },
  });

  return NextResponse.redirect(new URL(`/permission-slip/${token}?signed=1`, req.url), 303);
}
