import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { googleCalendarAddUrl } from "@/lib/calendar/ical";

export default async function PublicCalendar({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  const now = new Date();
  const events = await prisma.event.findMany({
    where: {
      orgId: org.id,
      OR: [
        { startsAt: { gte: now } },
        { rrule: { not: null } },
      ],
    },
    orderBy: { startsAt: "asc" },
    take: 50,
  });

  return (
    <section className="mx-auto max-w-content px-6 py-12">
      <div className="flex items-end justify-between mb-6">
        <h1 className="font-display text-3xl font-semibold">Calendar</h1>
        <Link
          href={`/o/${slug}/calendar.ical`}
          className="btn-secondary"
          aria-label="Subscribe via iCal"
        >
          Subscribe (iCal)
        </Link>
      </div>

      {events.length === 0 ? (
        <p className="text-ink-muted">No upcoming events.</p>
      ) : (
        <ul className="space-y-4">
          {events.map((ev) => {
            const url = googleCalendarAddUrl({
              id: ev.id,
              title: ev.title,
              description: ev.description,
              startsAt: ev.startsAt,
              endsAt: ev.endsAt,
              allDay: ev.allDay,
              location: ev.location,
            });
            const mapsUrl = ev.locationAddress
              ? `https://www.google.com/maps?q=${encodeURIComponent(ev.locationAddress)}`
              : null;
            return (
              <li key={ev.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-base">{ev.title}</div>
                    <div className="mt-1 text-sm text-ink-muted">
                      {ev.startsAt.toLocaleString()}
                      {ev.location ? ` · ${ev.location}` : ""}
                    </div>
                    {ev.description && (
                      <p className="mt-2 text-sm whitespace-pre-wrap">{ev.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <a href={url} target="_blank" rel="noreferrer" className="btn-secondary text-xs">
                      Add to Google
                    </a>
                    {mapsUrl && (
                      <a href={mapsUrl} target="_blank" rel="noreferrer" className="btn-secondary text-xs">
                        Directions
                      </a>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
