// Tell people promoted off a sign-up waitlist that they now have the
// seat. Called after the release transaction commits; a failed send is
// logged, never surfaced to whoever released.
//
// Mail goes to the address on the claim (the adult who signed up, or
// the signed-in user's account email). Scouts are never emailed
// directly: a claim held by a scout login in that unit is skipped.

import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db";
import { logger } from "@/lib/log";
import { sendMail } from "@/lib/mail";

const log = logger.child("slots");

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function promotionMessage(a: {
  name: string;
  scoutName: string;
  slotTitle: string;
  eventTitle: string;
  startsAt: Date;
  orgName: string;
}) {
  const when = a.startsAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const forWho = a.scoutName ? ` for ${esc(a.scoutName)}` : "";
  return {
    subject: `You're off the waitlist: ${a.slotTitle}`,
    html:
      `<p>Hi ${esc(a.name || "there")},</p>` +
      `<p>A spot opened up, so your waitlisted sign-up${forWho} for ` +
      `<strong>${esc(a.slotTitle)}</strong> at <strong>${esc(a.eventTitle)}</strong> ` +
      `(${esc(when)} UTC) is now confirmed.</p>` +
      `<p>If you can't make it any more, please release the spot so the next person gets it.</p>` +
      `<p>${esc(a.orgName)}</p>`,
  };
}

export async function notifyPromoted(
  promotedIds: string[],
  opts: { prismaClient?: PrismaClient; send?: typeof sendMail } = {},
): Promise<number> {
  if (!promotedIds.length) return 0;
  const db = opts.prismaClient ?? defaultPrisma;
  const send = opts.send ?? sendMail;
  const rows = await db.slotAssignment.findMany({
    where: { id: { in: promotedIds }, waitlisted: false },
    select: {
      orgId: true,
      name: true,
      email: true,
      scoutName: true,
      userId: true,
      slot: {
        select: {
          title: true,
          event: { select: { title: true, startsAt: true } },
          org: { select: { displayName: true } },
        },
      },
    },
  });
  let sent = 0;
  for (const r of rows) {
    try {
      let to = r.email;
      if (r.userId) {
        const [u, scoutSeat] = await Promise.all([
          db.user.findUnique({ where: { id: r.userId }, select: { email: true } }),
          db.orgMembership.count({ where: { userId: r.userId, orgId: r.orgId, role: "scout" } }),
        ]);
        if (scoutSeat > 0) continue;
        to = to || u?.email || null;
      }
      if (!to) continue;
      const msg = promotionMessage({
        name: r.name,
        scoutName: r.scoutName,
        slotTitle: r.slot.title,
        eventTitle: r.slot.event.title,
        startsAt: r.slot.event.startsAt,
        orgName: r.slot.org.displayName,
      });
      const res = await send({ to, toName: r.name, ...msg });
      if (res.ok) sent++;
      else log.warn("waitlist promotion mail failed", { err: res.error });
    } catch (err) {
      log.warn("waitlist promotion mail failed", { err: err instanceof Error ? err.message : String(err) });
    }
  }
  return sent;
}
