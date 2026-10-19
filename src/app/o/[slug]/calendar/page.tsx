import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { googleCalendarAddUrl } from "@/lib/calendar/ical";
import { getSession } from "@/lib/auth/session";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { RsvpForm } from "@/components/calendar/RsvpForm";
import { SlotSignupForm } from "@/components/calendar/SlotSignupForm";
import { PublicPageHeader } from "@/components/site/PublicPageHeader";
import {
  buildMonthGrid,
  colorForCategory,
  isoDay,
  monthLabel,
} from "@/lib/calendar/month-grid";

type Search = { view?: string; ym?: string };

function parseYm(ym: string | undefined): { year: number; month0: number } {
  if (ym && /^\d{4}-\d{2}$/.test(ym)) {
    const [y, m] = ym.split("-").map((s) => parseInt(s, 10));
    if (y && m && m >= 1 && m <= 12) return { year: y, month0: m - 1 };
  }
  const today = new Date();
  return { year: today.getFullYear(), month0: today.getMonth() };
}

function shiftYm(year: number, month0: number, delta: number): string {
  const d = new Date(year, month0 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function PublicCalendar({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const view = sp.view === "month" ? "month" : "list";
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  const { user } = await getSession();

  // Month-grid render — separate query window keyed on the selected
  // year/month so prev/next month nav doesn't lean on the upcoming
  // (rrule-aware) list query.
  if (view === "month") {
    const { year, month0 } = parseYm(sp.ym);
    const grid = buildMonthGrid(year, month0);
    const start = grid[0]!.date;
    const end = new Date(grid[grid.length - 1]!.date);
    end.setHours(23, 59, 59, 999);
    const monthEvents = await prisma.event.findMany({
      where: { orgId: org.id, startsAt: { gte: start, lte: end } },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        title: true,
        category: true,
        startsAt: true,
        allDay: true,
      },
    });
    type DayEvent = (typeof monthEvents)[number];
    const byDay = new Map<string, DayEvent[]>();
    for (const e of monthEvents) {
      const key = isoDay(e.startsAt);
      const list = byDay.get(key) ?? [];
      list.push(e);
      byDay.set(key, list);
    }
    const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return (
      <>
        <PublicPageHeader
          kicker="§ Calendar"
          title={monthLabel(year, month0)}
          description="Click a date to see what's happening that day."
          actions={
            <>
              <Link
                href={`/o/${slug}/calendar?view=month&ym=${shiftYm(year, month0, -1)}`}
                className="btn-secondary"
              >
                ← Prev
              </Link>
              <Link
                href={`/o/${slug}/calendar?view=month`}
                className="btn-secondary"
              >
                Today
              </Link>
              <Link
                href={`/o/${slug}/calendar?view=month&ym=${shiftYm(year, month0, 1)}`}
                className="btn-secondary"
              >
                Next →
              </Link>
              <Link href={`/o/${slug}/calendar`} className="btn-secondary">
                List view
              </Link>
              <Link
                href={`/o/${slug}/calendar.ical`}
                className="btn-secondary"
                aria-label="Subscribe via iCal"
              >
                iCal
              </Link>
            </>
          }
        />
        <section className="mx-auto max-w-content px-6 pb-16">
          <div className="grid grid-cols-7 gap-px bg-line border border-line rounded-xl overflow-hidden">
            {dow.map((d) => (
              <div
                key={d}
                className="bg-surface-alt font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted px-2 py-1.5 font-semibold"
              >
                {d}
              </div>
            ))}
            {grid.map((day) => {
              const dayEvents = byDay.get(day.iso) ?? [];
              const isToday = isoDay(new Date()) === day.iso;
              return (
                <div
                  key={day.iso}
                  className={
                    "bg-surface min-h-28 p-2 flex flex-col gap-1 " +
                    (day.inMonth ? "" : "opacity-40")
                  }
                >
                  <div className="flex items-baseline justify-between">
                    <span
                      className={
                        "text-xs font-mono " +
                        (isToday
                          ? "bg-accent text-white rounded-full h-5 w-5 grid place-items-center"
                          : "text-slate-muted")
                      }
                    >
                      {day.date.getDate()}
                    </span>
                  </div>
                  {dayEvents.slice(0, 3).map((e) => {
                    const c = colorForCategory(e.category);
                    return (
                      <Link
                        key={e.id}
                        href={`/o/${slug}/calendar?view=list#event-${e.id}`}
                        className="block truncate text-[11px] px-1.5 py-0.5 rounded border"
                        style={{ background: c.bg, color: c.ink, borderColor: c.line }}
                        title={e.title}
                      >
                        {e.allDay
                          ? ""
                          : `${e.startsAt.toLocaleTimeString([], { hour: "numeric" })} · `}
                        {e.title}
                      </Link>
                    );
                  })}
                  {dayEvents.length > 3 ? (
                    <span className="text-[10px] text-slate-muted">
                      +{dayEvents.length - 3} more
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      </>
    );
  }

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
    <>
      <PublicPageHeader
        kicker="§ Calendar"
        title="What's coming up."
        description="Outings, meetings, and trips. RSVPs and slot signups are at the bottom of each card."
        actions={
          <>
            <Link
              href={`/o/${slug}/calendar?view=month`}
              className="btn-secondary"
            >
              Month view
            </Link>
            <Link
              href={`/o/${slug}/calendar.ical`}
              className="btn-secondary"
              aria-label="Subscribe via iCal"
            >
              Subscribe (iCal)
            </Link>
          </>
        }
      />
      <section className="mx-auto max-w-content px-6 pb-16">
      {events.length === 0 ? (
        <p className="text-sm text-slate-muted">No upcoming events.</p>
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
            const c = colorForCategory(ev.category);
            return (
              <li key={ev.id} id={`event-${ev.id}`} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 flex items-start gap-3">
                    <span
                      className="mt-1.5 inline-block h-3 w-3 rounded-sm flex-shrink-0"
                      style={{ background: c.bg, border: `1px solid ${c.line}` }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-base">{ev.title}</div>
                      <div className="mt-1 text-sm text-ink-muted">
                        {ev.startsAt.toLocaleString()}
                        {ev.location ? ` · ${ev.location}` : ""}
                        {ev.category ? ` · ${ev.category}` : ""}
                      </div>
                      {ev.description && (
                        <p className="mt-2 text-sm whitespace-pre-wrap">{ev.description}</p>
                      )}
                    </div>
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

                <div className="mt-4 border-t border-line pt-3">
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
                  <div className="mt-3 border-t border-line pt-3 space-y-3">
                    <h3 className="text-sm font-medium">Signup slots</h3>
                    <ul className="space-y-3">
                      {ev.slots.map((slot) => {
                        const activeCount = slot.assignments.filter((a) => !a.waitlisted).length;
                        const waitlistCount = slot.assignments.filter((a) => a.waitlisted).length;
                        const full = activeCount >= slot.capacity;
                        return (
                          <li key={slot.id} className="rounded border border-line p-3">
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
    </>
  );
}
