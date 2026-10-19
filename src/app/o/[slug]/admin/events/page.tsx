// Admin events page with two views: list (default) + month grid.
// Toggle via ?view=month and navigate via ?ym=YYYY-MM.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  buildMonthGrid,
  colorForCategory,
  isoDay,
  monthLabel,
} from "@/lib/calendar/month-grid";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata = { title: "Events" };

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

export default async function AdminEventsList({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const sp = await searchParams;
  const view = sp.view === "month" ? "month" : "list";

  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  if (view === "month") {
    const { year, month0 } = parseYm(sp.ym);
    const grid = buildMonthGrid(year, month0);
    const start = grid[0]!.date;
    const end = new Date(grid[grid.length - 1]!.date);
    end.setHours(23, 59, 59, 999);

    const events = await prisma.event.findMany({
      where: { orgId: org.id, startsAt: { gte: start, lte: end } },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        title: true,
        category: true,
        startsAt: true,
        endsAt: true,
        allDay: true,
      },
    });
    type DayEvent = (typeof events)[number];
    const byDay = new Map<string, DayEvent[]>();
    for (const e of events) {
      const key = isoDay(e.startsAt);
      const list = byDay.get(key) ?? [];
      list.push(e);
      byDay.set(key, list);
    }

    const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return (
      <section className="space-y-6">
        <AdminPageHeader
          kicker="Calendar"
          title={monthLabel(year, month0)}
          description="Click an event chip to open the editor."
          actions={
            <>
              <Link
                href={`/o/${slug}/admin/events?view=month&ym=${shiftYm(year, month0, -1)}`}
                className="btn-secondary"
              >
                ← Prev
              </Link>
              <Link
                href={`/o/${slug}/admin/events?view=month`}
                className="btn-secondary"
              >
                Today
              </Link>
              <Link
                href={`/o/${slug}/admin/events?view=month&ym=${shiftYm(year, month0, 1)}`}
                className="btn-secondary"
              >
                Next →
              </Link>
              <Link href={`/o/${slug}/admin/events`} className="btn-secondary">
                List view
              </Link>
              <Link
                href={`/o/${slug}/admin/events/new`}
                className="btn-primary"
              >
                + New event
              </Link>
            </>
          }
        />
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
                      href={`/o/${slug}/admin/events/${e.id}`}
                      className="block truncate text-[11px] px-1.5 py-0.5 rounded border"
                      style={{ background: c.bg, color: c.ink, borderColor: c.line }}
                      title={`${e.title}${e.startsAt ? " · " + e.startsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}`}
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
    );
  }

  // List view (default).
  const events = await prisma.event.findMany({
    where: { orgId: org.id },
    orderBy: { startsAt: "desc" },
    take: 50,
    include: { _count: { select: { rsvps: true } } },
  });
  return (
    <section className="space-y-8">
      <AdminPageHeader
        kicker="Calendar"
        title="Events"
        description="Schedule outings, meetings, and trips. RSVPs roll up here."
        actions={
          <>
            <Link
              href={`/o/${slug}/admin/events?view=month`}
              className="btn-secondary"
            >
              Month view
            </Link>
            <Link href={`/o/${slug}/admin/events/new`} className="btn-primary">
              + New event
            </Link>
          </>
        }
      />
      {events.length === 0 ? (
        <p className="text-sm text-slate-muted">No events yet.</p>
      ) : (
        <ul className="space-y-3">
          {events.map((ev) => {
            const c = colorForCategory(ev.category);
            return (
              <li key={ev.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-1 inline-block h-3 w-3 rounded-sm flex-shrink-0"
                      style={{ background: c.bg, border: `1px solid ${c.line}` }}
                      aria-hidden
                    />
                    <div>
                      <Link
                        href={`/o/${slug}/admin/events/${ev.id}`}
                        className="text-base font-semibold text-ink hover:text-accent"
                      >
                        {ev.title}
                      </Link>
                      <div className="mt-1 text-sm text-slate-soft">
                        {ev.startsAt.toLocaleString()}
                        {ev.location ? ` · ${ev.location}` : ""}
                        {ev.category ? ` · ${ev.category}` : ""}
                        {ev.rrule ? " · recurring" : ""}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-slate-muted">
                    {ev._count.rsvps} RSVP{ev._count.rsvps === 1 ? "" : "s"}
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
