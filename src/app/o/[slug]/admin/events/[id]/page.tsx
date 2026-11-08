import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { EventForm } from "@/components/admin/EventForm";
import { ImportSlotsForm } from "@/components/admin/ImportSlotsForm";
import { AddSlotForm } from "@/components/admin/AddSlotForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DeleteEventButton } from "@/components/admin/DeleteContentButtons";
import {
  AddStaffForm,
  AnnounceForm,
  CreateChannelForm,
  StaffRow,
} from "@/components/admin/EventStaffForms";
import { STAFF_ROLE_LABELS, type StaffRole } from "@/lib/events/staff";
import { listEventChannels } from "@/lib/events/messaging";
import { requireAdminPage } from "@/lib/admin/guard";
import { eventHealthGaps } from "@/lib/members/health-forms";

export const metadata = { title: "Event" };

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  await requireAdminPage(slug);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const [event, locations] = await Promise.all([
    prisma.event.findUnique({
      where: { id, orgId: org.id },
      include: {
        rsvps: { orderBy: { createdAt: "desc" } },
        slots: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: { assignments: { select: { waitlisted: true } } },
        },
      },
    }),
    prisma.location.findMany({
      where: { orgId: org.id, archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, address: true },
    }),
  ]);
  if (!event) notFound();

  const [staff, stations, counselors, channels, health] = await Promise.all([
    prisma.eventStaff.findMany({
      where: { eventId: event.id },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true, status: true, slotId: true, notes: true },
    }),
    prisma.signupSlot.findMany({
      where: { eventId: event.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true },
    }),
    prisma.meritBadgeCounselor.findMany({
      where: { orgId: org.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    listEventChannels(event.id, { userId: "", isLeader: true }),
    eventHealthGaps(org, event),
  ]);
  const staffYes = staff.filter((s) => s.status === "yes").length;
  const staffByRole = new Map<string, typeof staff>();
  for (const s of staff) staffByRole.set(s.role, [...(staffByRole.get(s.role) ?? []), s]);

  const total = event.rsvps.length;
  const yeses = event.rsvps.filter((r) => r.response === "yes").length;

  return (
    <section className="space-y-10">
      <AdminPageHeader
        kicker="Calendar"
        title={event.title}
        description={`${total} RSVPs · ${yeses} yes`}
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href={`/o/${slug}/admin/events`}>← All events</Link>
        <a href="#slots">Sign-up slots ↓</a>
        <Link href={`/o/${slug}/admin/events/${event.id}/emergency-contacts`}>
          Emergency contacts →
        </Link>
        <Link href={`/o/${slug}/admin/events/${event.id}/permission-slips`}>
          Permission slips →
        </Link>
      </div>
      {health.gaps.length > 0 ? (
        <div role="status" className="rounded-xl border border-attention/30 bg-attention-soft p-5">
          <h2 className="text-base font-semibold text-ink">
            {health.gaps.length} of {health.checked} going {health.checked === 1 ? "isn't" : "aren't"} covered by a health form
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            {health.needsExam
              ? "This event runs over 72 hours, so everyone needs parts A and B and a doctor's exam (part C) good through the last day."
              : "Everyone going needs parts A and B good through the last day."}
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {health.gaps.map((g) => (
              <li key={g.memberId} className="flex flex-wrap gap-x-2">
                <Link href={`/o/${slug}/admin/members/${g.memberId}?tab=medical`} className="font-medium">
                  {g.name}
                </Link>
                <span className="text-ink-2">{g.problem}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-2">
            Only counts yes RSVPs linked to the roster. <Link href={`/o/${slug}/admin/reports#health`}>Health form report →</Link>
          </p>
        </div>
      ) : null}
      <EventForm
        orgSlug={slug}
        initial={{
          id: event.id,
          title: event.title,
          description: event.description,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          allDay: event.allDay,
          location: event.location,
          locationAddress: event.locationAddress,
          category: event.category,
          cost: event.cost,
          capacity: event.capacity,
          signupRequired: event.signupRequired,
          publicSlug: event.publicSlug,
          rrule: event.rrule,
          recurrenceUntil: event.recurrenceUntil,
          serviceHours: event.serviceHours,
          campingNights: event.campingNights,
          hikingMiles: event.hikingMiles,
          requiresPermissionSlip: event.requiresPermissionSlip,
          permissionSlipText: event.permissionSlipText,
          locationId: event.locationId,
        }}
        csrf={<CsrfTokenInput />}
        locations={locations}
      />

      <div id="slots" className="border-t border-line pt-6 space-y-4">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.015em]">Sign-up slots</h2>
        {event.slots.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-muted">
              <tr>
                <th className="py-1">Slot</th>
                <th className="py-1">Key</th>
                <th className="py-1">Taken</th>
                <th className="py-1">Waitlist</th>
              </tr>
            </thead>
            <tbody>
              {event.slots.map((s) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="py-2">{s.title}</td>
                  <td className="py-2 font-mono text-xs">{s.key ?? "—"}</td>
                  <td className="py-2">
                    {s.assignments.filter((a) => !a.waitlisted).length} / {s.capacity}
                  </td>
                  <td className="py-2">{s.assignments.filter((a) => a.waitlisted).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-2">
            <h3 className="font-medium">Add a slot</h3>
            <AddSlotForm orgSlug={slug} eventId={event.id} csrf={<CsrfTokenInput />} />
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">Import stations and roles from Waypoint</h3>
            <ImportSlotsForm orgSlug={slug} eventId={event.id} csrf={<CsrfTokenInput />} />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-[-0.015em]">Staff</h2>
          <p className="text-sm text-slate-muted">
            Counselors, station staff and volunteers. Each gets an email with a private link to answer.
            {staff.length > 0 ? ` ${staffYes} of ${staff.length} confirmed.` : ""}
          </p>
        </div>
        {staff.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-muted">
              <tr>
                <th className="py-1">Name</th>
                <th className="py-1">Status</th>
                <th className="py-1" colSpan={2}>Role · station</th>
              </tr>
            </thead>
            {[...staffByRole.entries()].map(([role, rows]) => (
              <tbody key={role}>
                <tr>
                  <td colSpan={4} className="pt-4 pb-1 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                    {STAFF_ROLE_LABELS[role as StaffRole] ?? role} ({rows.length})
                  </td>
                </tr>
                {rows.map((s) => (
                  <StaffRow
                    key={s.id}
                    orgSlug={slug}
                    eventId={event.id}
                    staff={s}
                    stations={stations}
                    csrf={<CsrfTokenInput />}
                  />
                ))}
              </tbody>
            ))}
          </table>
        )}
        <AddStaffForm
          orgSlug={slug}
          eventId={event.id}
          stations={stations}
          counselors={counselors}
          csrf={<CsrfTokenInput />}
        />
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-[-0.015em]">Messages</h2>
          <p className="text-sm text-slate-muted">
            Chat channels for staff, a single station, or attending families, plus email for anyone not on Compass.
          </p>
        </div>
        {channels.length > 0 && (
          <ul className="space-y-1 text-sm">
            {channels.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/o/${slug}/chat?channel=${c.id}`}>{c.name}</Link>
                <span className="pill">{c.audience}</span>
                <span className="text-slate-muted">{c.memberCount} members</span>
                {c.isSuspended ? <span className="pill text-danger">paused: two-deep</span> : null}
                {c.archived ? <span className="pill">archived</span> : null}
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <CreateChannelForm orgSlug={slug} eventId={event.id} stations={stations} csrf={<CsrfTokenInput />} />
          <AnnounceForm orgSlug={slug} eventId={event.id} stations={stations} csrf={<CsrfTokenInput />} />
        </div>
      </div>

      <div className="border-t border-line pt-6">
        <DeleteEventButton orgSlug={slug} id={event.id} csrf={<CsrfTokenInput />} />
      </div>

      {total > 0 && (
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-[-0.015em] mb-3">RSVPs</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-muted">
              <tr>
                <th className="py-1">Name</th>
                <th className="py-1">Email</th>
                <th className="py-1">Response</th>
                <th className="py-1">Guests</th>
              </tr>
            </thead>
            <tbody>
              {event.rsvps.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-2">{r.name}</td>
                  <td className="py-2">{r.email ?? "—"}</td>
                  <td className="py-2">{r.response}</td>
                  <td className="py-2">{r.guests}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
