// Admin overview. Mirrors AdminBalanced from
// design_handoff_compass/designs/admin-pages.jsx — dark slate hero
// band with day-of-week display, four color-top-border stat cards,
// "What's coming up" events list with RSVP progress bars, and a
// "Recent activity" feed.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/guard";

const SECONDARY = {
  sky: "var(--accent)", // #1d4ed8
  ember: "var(--ember)", // #f59e0b
  teal: "var(--teal)", // #0891b2
  plum: "var(--plum)", // #475569
} as const;

function dayOfWeek(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

function partOfDay(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "night";
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dayName(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function timeOfDay(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function relativeTime(d: Date, now: Date): string {
  const diffMs = now.getTime() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function AdminOverview({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const org = await prisma.org.findUnique({
    where: { slug },
    include: {
      _count: { select: { members: true, announcements: true, events: true } },
    },
  });
  if (!org) notFound();

  const now = new Date();
  const [
    activeMembersCount,
    upcomingEvents,
    upcomingEventsCount,
    photoCount,
    recentPosts,
    recentPhotos,
    recentMembers,
  ] = await Promise.all([
    prisma.member.count({ where: { orgId: org.id, deletedAt: null } }),
    prisma.event.findMany({
      where: { orgId: org.id, startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 4,
      include: { _count: { select: { rsvps: true } } },
    }),
    prisma.event.count({
      where: { orgId: org.id, startsAt: { gte: now } },
    }),
    prisma.photo.count({ where: { orgId: org.id } }),
    prisma.post.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        title: true,
        createdAt: true,
        author: { select: { email: true } },
      },
    }),
    prisma.photo.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        createdAt: true,
        uploader: { select: { email: true } },
        album: { select: { title: true } },
      },
    }),
    prisma.member.findMany({
      where: { orgId: org.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, createdAt: true },
    }),
  ]);

  const stats = [
    { label: "Members", value: activeMembersCount, hint: "active in roster", color: SECONDARY.sky },
    { label: "Upcoming", value: upcomingEventsCount, hint: "events scheduled", color: SECONDARY.ember },
    { label: "Posts", value: org._count.announcements, hint: "announcements published", color: SECONDARY.teal },
    { label: "Photos", value: photoCount, hint: "in galleries", color: SECONDARY.plum },
  ];

  const vaultOk = !!org.encryptedDek;

  // Build a unified activity feed.
  type Activity = { who: string; what: string; when: Date; icon: "mail" | "image" | "user"; color: string };
  const activity: Activity[] = [];
  for (const p of recentPosts) {
    activity.push({
      who: p.author?.email ?? "Someone",
      what: `posted "${p.title}"`,
      when: p.createdAt,
      icon: "mail",
      color: SECONDARY.sky,
    });
  }
  for (const ph of recentPhotos) {
    activity.push({
      who: ph.uploader?.email ?? "Someone",
      what: `uploaded a photo${ph.album?.title ? ` to ${ph.album.title}` : ""}`,
      when: ph.createdAt,
      icon: "image",
      color: SECONDARY.plum,
    });
  }
  for (const m of recentMembers) {
    activity.push({
      who: "Roster",
      what: "added a new member",
      when: m.createdAt,
      icon: "user",
      color: SECONDARY.teal,
    });
  }
  activity.sort((a, b) => b.when.getTime() - a.when.getTime());
  const feed = activity.slice(0, 8);

  return (
    <section>
      {/* Hero band */}
      <div className="relative overflow-hidden rounded-2xl bg-surface-dark px-9 py-8 text-white">
        <span className="inline-flex items-center rounded-full bg-sky px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
          {(org.unitType ?? "Org")} {org.unitNumber ?? ""} · This week
        </span>
        <h1 className="mt-4 font-display text-5xl font-normal leading-[0.95] tracking-[-0.03em]">
          {dayOfWeek(now)}
          <span className="italic text-sky">, {partOfDay(now)}.</span>
        </h1>
        <p className="mt-3 max-w-xl text-sm text-white/70">
          {upcomingEventsCount > 0
            ? `${upcomingEventsCount} upcoming event${upcomingEventsCount === 1 ? "" : "s"} · ${activeMembersCount} member${activeMembersCount === 1 ? "" : "s"} on roster`
            : "No upcoming events scheduled — add one to get started."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/o/${slug}/admin/announcements`}
            className="inline-flex items-center rounded-full border border-white/30 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            Send announcement
          </Link>
          <Link
            href={`/o/${slug}/admin/events/new`}
            className="inline-flex items-center rounded-full bg-sky px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky/90"
          >
            + New event
          </Link>
        </div>
      </div>

      {/* Encryption status banner */}
      <Link
        href={`/o/${slug}/admin/security`}
        className={
          "mt-6 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs " +
          (vaultOk
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-800")
        }
      >
        <span aria-hidden>{vaultOk ? "🔒" : "⚠"}</span>
        Encryption{" "}
        {vaultOk
          ? `enabled · key v${org.keyVersion}${org.keyRotatedAt ? ` · ${new Date(org.keyRotatedAt).toLocaleDateString()}` : ""}`
          : "not provisioned"}
      </Link>

      {/* Stats — 4-up, color-top-border */}
      <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-line bg-white p-6"
            style={{ borderTop: `4px solid ${s.color}` }}
          >
            <div
              className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em]"
              style={{ color: s.color }}
            >
              {s.label}
            </div>
            <div className="font-display text-5xl font-normal leading-none tracking-[-0.025em] text-slate-ink">
              {s.value}
            </div>
            <div className="mt-2.5 text-xs text-slate-soft">{s.hint}</div>
          </div>
        ))}
      </div>

      {/* Body grid: events + activity */}
      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <div className="mb-1.5 font-display text-xs italic text-sky">§ Calendar</div>
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="font-display text-3xl font-normal tracking-[-0.015em]">
              What&apos;s coming up.
            </h2>
            <Link
              href={`/o/${slug}/admin/events`}
              className="text-xs font-medium text-sky hover:text-slate-ink"
            >
              All events →
            </Link>
          </div>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-slate-muted">
              No upcoming events.{" "}
              <Link href={`/o/${slug}/admin/events/new`} className="text-sky hover:text-slate-ink">
                Add one
              </Link>
              .
            </p>
          ) : (
            upcomingEvents.map((e, i) => {
              const accent = [SECONDARY.sky, SECONDARY.ember, SECONDARY.teal, SECONDARY.plum][i % 4]!;
              return (
                <Link
                  key={e.id}
                  href={`/o/${slug}/admin/events/${e.id}`}
                  className="grid grid-cols-[90px_1fr_180px] items-center gap-5 border-t-2 py-5 transition-colors hover:bg-line-soft/40"
                  style={{ borderTopColor: accent }}
                >
                  <div
                    className="font-display text-2xl font-medium italic"
                    style={{ color: accent }}
                  >
                    {shortDate(e.startsAt)}
                  </div>
                  <div>
                    <div className="text-base font-semibold text-slate-ink">{e.title}</div>
                    <div className="mt-0.5 text-xs text-slate-soft">
                      {dayName(e.startsAt)} · {timeOfDay(e.startsAt)}
                      {e.location ? ` · ${e.location}` : ""}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1.5 text-xs text-slate-soft">
                      {e._count.rsvps} RSVP{e._count.rsvps === 1 ? "" : "s"}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-sm bg-line-soft">
                      <div
                        className="h-full"
                        style={{
                          background: accent,
                          width: `${Math.min(
                            100,
                            (e._count.rsvps / Math.max(activeMembersCount, 1)) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        <div>
          <div className="mb-1.5 font-display text-xs italic text-sky">§ Activity</div>
          <h2 className="mb-5 font-display text-3xl font-normal tracking-[-0.015em]">
            The last few hours.
          </h2>
          {feed.length === 0 ? (
            <p className="text-sm text-slate-muted">No recent activity.</p>
          ) : (
            feed.map((a, i) => (
              <div
                key={i}
                className={
                  "flex items-start gap-3.5 py-3 " +
                  (i > 0 ? "border-t border-line-soft" : "border-t border-line")
                }
              >
                <div
                  className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-white"
                  style={{ background: a.color }}
                >
                  <ActivityIcon icon={a.icon} />
                </div>
                <div className="flex-1">
                  <div className="text-sm">
                    <span className="font-semibold">{a.who}</span>{" "}
                    <span className="text-slate-soft">{a.what}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-muted">
                    {relativeTime(a.when, now)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function ActivityIcon({ icon }: { icon: "mail" | "image" | "user" }) {
  if (icon === "mail") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </svg>
    );
  }
  if (icon === "image") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="M21 15l-5-5L6 21" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0116 0" />
    </svg>
  );
}
