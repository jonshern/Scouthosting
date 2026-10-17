// POST /api/v1/events/[id]/permission-slips { memberId, signedByName,
// notes? } — a parent signs their scout's permission slip from the app.
//
// Same rules as the emailed link (/permission-slip/<token>): the signer
// must be linked as one of the scout's parents on the roster (matched
// by the account's verified email), the event can't have ended, and a
// signature can't be changed once the event starts. The slip text is
// snapshotted with the signature.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { canSignSlip, effectiveSlipText } from "@/lib/permission-slips";
import { clientIp } from "@/lib/security/client-ip";
import { loadVerifiedUser } from "@/lib/api/v1-events";
import {
  ApiError,
  LIMITS,
  badRequest,
  json,
  notFound,
  parseId,
  readJson,
  requireOrgAccessForResource,
  v1Route,
} from "@/lib/api/v1";

export const runtime = "nodejs";

const Body = z.object({
  memberId: z.string().trim().min(1).max(64),
  signedByName: z.string().trim().min(1, { message: "name_required" }).max(200),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const POST = v1Route<{ id: string }>(
  async (req, { user, params }) => {
    const id = parseId(params.id);
    const event = await prisma.event.findUnique({
      where: { id },
      select: {
        id: true,
        orgId: true,
        startsAt: true,
        endsAt: true,
        requiresPermissionSlip: true,
        permissionSlipText: true,
      },
    });
    if (!event) throw notFound();
    await requireOrgAccessForResource(event.orgId, user.id, { write: true });
    if (!event.requiresPermissionSlip) throw badRequest("slip_not_required");

    const input = await readJson(req, Body);
    const me = await loadVerifiedUser(user);
    if (!me.emailVerified) throw new ApiError(403, "email_not_verified");

    const [member, existing] = await Promise.all([
      prisma.member.findFirst({
        where: { id: input.memberId, orgId: event.orgId },
        select: { id: true, orgId: true, isYouth: true, deletedAt: true, parentIds: true },
      }),
      prisma.permissionSlip.findUnique({
        where: { eventId_memberId: { eventId: event.id, memberId: input.memberId } },
        select: { id: true },
      }),
    ]);
    // Not this org's member: same 404 as a missing one, so ids can't be probed.
    if (!member) throw notFound("member_not_found");
    const parents = member.parentIds.length
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
      claimedParentEmail: me.email,
      alreadySigned: !!existing,
    });
    if (!decision.ok) throw new ApiError(403, `slip_${decision.reason}`, { message: decision.message });

    const fields = {
      signedByName: input.signedByName,
      signedByEmail: me.email.toLowerCase(),
      signedIp: clientIp(req.headers),
      slipTextSnapshot: effectiveSlipText(event.permissionSlipText),
      notes: input.notes || null,
    };
    const slip = await prisma.permissionSlip.upsert({
      where: { eventId_memberId: { eventId: event.id, memberId: member.id } },
      create: { orgId: event.orgId, eventId: event.id, memberId: member.id, ...fields },
      update: { ...fields, signedAt: new Date() },
      select: { memberId: true, signedByName: true, signedAt: true },
    });
    return json({ slip });
  },
  { limits: [LIMITS.rsvp] },
);
