// POST handler for the public permission slip signing form. Verifies
// the token, captures IP + signed name, upserts a PermissionSlip
// keyed on (eventId, memberId). Resigning overwrites — the latest
// signature wins. We snapshot the slipText at submit time so future
// edits to the event's consent language don't retroactively change
// what the parent agreed to.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPermSlipToken } from "@/lib/security/perm-slip-token";
import { canSignSlip, effectiveSlipText } from "@/lib/permission-slips";
import { clientIp as trustedClientIp } from "@/lib/security/client-ip";

// The signer's IP goes on the consent record, so read it from the header
// the platform sets, not the client-supplied front of X-Forwarded-For.
function clientIp(req: Request): string | null {
  return trustedClientIp(req.headers);
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

  const [event, member, existing] = await Promise.all([
    prisma.event.findUnique({
      where: { id: claims.eventId },
      select: { id: true, orgId: true, permissionSlipText: true, startsAt: true, endsAt: true },
    }),
    prisma.member.findUnique({
      where: { id: claims.memberId },
      select: { id: true, orgId: true, isYouth: true, deletedAt: true, parentIds: true },
    }),
    prisma.permissionSlip.findUnique({
      where: { eventId_memberId: { eventId: claims.eventId, memberId: claims.memberId } },
      select: { id: true },
    }),
  ]);
  if (!event || event.orgId !== claims.orgId) {
    return NextResponse.redirect(new URL(`/permission-slip/${token}?error=missing`, req.url), 303);
  }
  const parents = member?.parentIds.length
    ? await prisma.member.findMany({
        where: { orgId: event.orgId, id: { in: member.parentIds }, deletedAt: null },
        select: { email: true },
      })
    : [];
  const decision = canSignSlip({
    now: new Date(),
    event,
    member,
    parentEmails: parents.map((p) => p.email),
    claimedParentEmail: claims.parentEmail,
    alreadySigned: !!existing,
  });
  if (!decision.ok) {
    return NextResponse.redirect(
      new URL(`/permission-slip/${token}?error=${encodeURIComponent(decision.message)}`, req.url),
      303,
    );
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
