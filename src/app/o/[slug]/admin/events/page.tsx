import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default async function AdminEventsList({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({
    where: { slug },
    include: {
      events: {
        orderBy: { startsAt: "desc" },
        take: 50,
        include: { _count: { select: { rsvps: true } } },
      },
    },
  });
  if (!org) notFound();
  return (
    <section className="space-y-8">
      <AdminPageHeader
        kicker="Calendar"
        title="Events"
        description="Schedule outings, meetings, and trips. RSVPs roll up here."
        actions={
          <Link href={`/o/${slug}/admin/events/new`} className="btn-primary">
            + New event
          </Link>
        }
      />
      {org.events.length === 0 ? (
        <p className="text-sm text-slate-muted">No events yet.</p>
      ) : (
        <ul className="space-y-3">
          {org.events.map((ev) => (
            <li key={ev.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Link
                    href={`/o/${slug}/admin/events/${ev.id}`}
                    className="text-base font-semibold text-slate-ink hover:text-sky"
                  >
                    {ev.title}
                  </Link>
                  <div className="mt-1 text-sm text-slate-soft">
                    {ev.startsAt.toLocaleString()}
                    {ev.location ? ` · ${ev.location}` : ""}
                    {ev.rrule ? " · recurring" : ""}
                  </div>
                </div>
                <div className="text-sm text-slate-muted">
                  {ev._count.rsvps} RSVP{ev._count.rsvps === 1 ? "" : "s"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
