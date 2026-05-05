import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

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
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold">Events</h1>
        <Link href={`/o/${slug}/admin/events/new`} className="btn-primary">
          New event
        </Link>
      </div>
      {org.events.length === 0 && <p className="text-ink-muted">No events yet.</p>}
      <ul className="space-y-3">
        {org.events.map((ev) => (
          <li key={ev.id} className="card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Link
                  href={`/o/${slug}/admin/events/${ev.id}`}
                  className="font-medium text-base"
                >
                  {ev.title}
                </Link>
                <div className="mt-1 text-sm text-ink-muted">
                  {ev.startsAt.toLocaleString()}
                  {ev.location ? ` · ${ev.location}` : ""}
                  {ev.rrule ? " · recurring" : ""}
                </div>
              </div>
              <div className="text-sm text-ink-muted">{ev._count.rsvps} RSVPs</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
