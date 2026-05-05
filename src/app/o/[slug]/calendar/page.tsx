import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { googleCalendarAddUrl } from "@/lib/calendar/ical";
import { getSession } from "@/lib/auth/lucia";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { RsvpForm } from "@/components/calendar/RsvpForm";
import { SlotSignupForm } from "@/components/calendar/SlotSignupForm";

export default async function PublicCalendar({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  const { user } = await getSession();

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
    include: {
      slots: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          assignments: {
            select: { id: true, waitlisted: true },
          },
        },
      },
    },
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
                  <div className="flex-1">
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

                <div className="mt-4 border-t border-ink-muted/15 pt-3">
                  <details>
                    <summary className="text-sm cursor-pointer font-medium">RSVP</summary>
                    <RsvpForm
                      orgSlug={slug}
                      eventId={ev.id}
                      signedIn={!!user}
                      csrf={<CsrfTokenInput />}
                    />
                  </details>
                </div>

                {ev.slots.length > 0 && (
                  <div className="mt-3 border-t border-ink-muted/15 pt-3 space-y-3">
                    <h3 className="text-sm font-medium">Signup slots</h3>
                    <ul className="space-y-3">
                      {ev.slots.map((slot) => {
                        const activeCount = slot.assignments.filter((a) => !a.waitlisted).length;
                        const waitlistCount = slot.assignments.filter((a) => a.waitlisted).length;
                        const full = activeCount >= slot.capacity;
                        return (
                          <li key={slot.id} className="rounded border border-ink-muted/15 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium">{slot.title}</div>
                                <div className="text-xs text-ink-muted">
                                  {activeCount} / {slot.capacity} filled
                                  {slot.allowWaitlist && waitlistCount > 0
                                    ? ` · ${waitlistCount} on waitlist`
                                    : ""}
                                </div>
                                {slot.description && (
                                  <p className="mt-1 text-sm whitespace-pre-wrap">{slot.description}</p>
                                )}
                              </div>
                            </div>
                            <details className="mt-2">
                              <summary className="text-xs cursor-pointer">
                                {full
                                  ? slot.allowWaitlist
                                    ? "Join waitlist"
                                    : "Slot full"
                                  : "Sign up"}
                              </summary>
                              <SlotSignupForm
                                orgSlug={slug}
                                slotId={slot.id}
                                signedIn={!!user}
                                csrf={<CsrfTokenInput />}
                                full={full}
                                allowWaitlist={slot.allowWaitlist}
                              />
                            </details>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
