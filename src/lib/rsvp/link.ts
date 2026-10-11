// One-click email RSVP. Opening the link only shows a confirm screen:
// mail scanners and link previewers fetch every URL in a message, so a
// GET that records "yes" (and settles the event charge) would RSVP
// people who never clicked. The answer is recorded on the POST.

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import type { RsvpClaims } from "@/lib/security/rsvp-token";
import {
  memberForUserInOrg,
  settleEventChargeForRsvp,
} from "@/lib/treasury/event-charge";

export type LinkResponse = "yes" | "no" | "maybe";

export function parseLinkResponse(r: unknown): LinkResponse | null {
  return r === "yes" || r === "no" || r === "maybe" ? r : null;
}

export function parseLinkGuests(g: unknown): number {
  const n = Math.floor(Number(g ?? 0));
  return Number.isFinite(n) ? Math.min(20, Math.max(0, n)) : 0;
}

export async function recordLinkRsvp(args: {
  claims: RsvpClaims;
  response: LinkResponse;
  guests: number;
  prismaClient?: PrismaClient;
}): Promise<{ ok: true; eventId: string } | { ok: false; reason: "event" }> {
  const db = args.prismaClient ?? defaultPrisma;
  const { claims, response, guests } = args;
  const email = claims.email.toLowerCase();

  const event = await db.event.findUnique({
    where: { id: claims.eventId },
    select: { id: true, orgId: true },
  });
  if (!event) return { ok: false, reason: "event" };

  const memberId = await memberForUserInOrg({ orgId: event.orgId, userEmail: email });

  const existing = await db.rsvp.findFirst({
    where: { eventId: event.id, email },
    select: { id: true, memberId: true },
  });
  if (existing) {
    await db.rsvp.update({
      where: { id: existing.id },
      data: { response, guests, memberId: existing.memberId ?? memberId ?? null },
    });
  } else {
    await db.rsvp.create({
      data: {
        orgId: event.orgId,
        eventId: event.id,
        name: claims.name,
        email,
        memberId,
        response,
        guests,
      },
    });
  }

  if (memberId) {
    try {
      await settleEventChargeForRsvp({ orgId: event.orgId, eventId: event.id, memberId, response });
    } catch (err) {
      console.error("event-charge settlement failed", err);
    }
  }
  return { ok: true, eventId: event.id };
}
