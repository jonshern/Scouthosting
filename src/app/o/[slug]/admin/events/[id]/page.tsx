import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { EventForm } from "@/components/admin/EventForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const event = await prisma.event.findUnique({
    where: { id, orgId: org.id },
    include: {
      rsvps: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!event) notFound();

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
        <Link href={`/o/${slug}/admin/events/${event.id}/slots`}>
          Manage signup slots →
        </Link>
      </div>
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
          rrule: event.rrule,
          recurrenceUntil: event.recurrenceUntil,
          serviceHours: event.serviceHours,
          campingNights: event.campingNights,
          hikingMiles: event.hikingMiles,
        }}
        csrf={<CsrfTokenInput />}
      />

      {total > 0 && (
        <div>
          <h2 className="font-display text-2xl font-normal tracking-[-0.015em] mb-3">RSVPs</h2>
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
                <tr key={r.id} className="border-t border-ink-muted/15">
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
