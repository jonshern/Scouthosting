// /staff-rsvp?token=… — where the staff invite email lands. Shows what
// the person was asked to do and lets them answer yes / no / maybe
// without signing in. The answer goes to POST /api/events/staff-rsvp.

import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { STAFF_ROLE_LABELS, hashStaffToken, isEventOver, type StaffRole } from "@/lib/events/staff";
import { StaffRsvpForm } from "@/components/public/StaffRsvpForm";

export const metadata: Metadata = { title: "Event staff RSVP", robots: { index: false } };

export default async function StaffRsvpPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const staff =
    token && /^[A-Za-z0-9_-]{20,200}$/.test(token)
      ? await prisma.eventStaff.findUnique({
          where: { rsvpTokenHash: hashStaffToken(token) },
          select: {
            name: true,
            role: true,
            status: true,
            slot: { select: { title: true } },
            event: {
              select: {
                title: true,
                startsAt: true,
                endsAt: true,
                location: true,
                org: { select: { displayName: true } },
              },
            },
          },
        })
      : null;

  if (!token || !staff) {
    return (
      <main className="mx-auto max-w-content px-6 py-16 text-center">
        <h1 className="font-display font-semibold text-3xl">Link not valid</h1>
        <p className="mt-2 text-ink-muted">
          This link doesn&apos;t match an invitation. Ask the event organizer to send it again.
        </p>
      </main>
    );
  }

  if (isEventOver(staff.event)) {
    return (
      <main className="mx-auto max-w-content px-6 py-16 text-center">
        <h1 className="font-display font-semibold text-3xl">This event is over</h1>
        <p className="mt-2 text-ink-muted">
          {staff.event.title} has ended, so this link no longer takes answers. Thanks for being willing to help.
        </p>
      </main>
    );
  }

  const role = STAFF_ROLE_LABELS[staff.role as StaffRole] ?? staff.role;
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <p className="text-sm text-ink-muted">{staff.event.org.displayName}</p>
      <h1 className="font-display font-semibold text-3xl">{staff.event.title}</h1>
      <p className="mt-2 text-ink-muted">
        {staff.event.startsAt.toLocaleString()}
        {staff.event.location ? ` · ${staff.event.location}` : ""}
      </p>
      <p className="mt-6">
        Hi {staff.name}, you&apos;ve been asked to help as <strong>{role}</strong>
        {staff.slot ? (
          <>
            {" "}at the <strong>{staff.slot.title}</strong> station
          </>
        ) : null}
        . Can you make it?
      </p>
      <StaffRsvpForm token={token} initialStatus={staff.status} />
    </main>
  );
}
