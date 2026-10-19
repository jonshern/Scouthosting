// Admin overview (Modern Clean, Admin board): the day and a greeting
// with the two main actions, a joined stat strip, then "What's coming
// up" with RSVP bars beside "The last few hours" of activity.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/guard";

// Icon wells in the activity feed: a soft fill with matching text.
const WELL = {
  accent: "bg-accent-soft text-accent-soft-text",
  attention: "bg-attention-soft text-attention-text",
  neutral: "bg-sunk text-ink-2",
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
    { label: "Members", value: activeMembersCount, hint: "active in roster" },
    { label: "Upcoming", value: upcomingEventsCount, hint: "events scheduled" },
    { label: "Posts", value: org._count.announcements, hint: "announcements published" },
    { label: "Photos", value: photoCount, hint: "in galleries" },
  ];

  const vaultOk = !!org.encryptedDek;

  // Build a unified activity feed.
  type Activity = { who: string; what: string; when: Date; icon: "mail" | "image" | "user"; tone: string };
  const activity: Activity[] = [];
  for (const p of recentPosts) {
    activity.push({
      who: p.author?.email ?? "Someone",
      what: `posted "${p.title}"`,
      when: p.createdAt,
      icon: "mail",
      tone: WELL.accent,
    });
  }
  for (const ph of recentPhotos) {
    activity.push({
      who: ph.uploader?.email ?? "Someone",
      what: `uploaded a photo${ph.album?.title ? ` to ${ph.album.title}` : ""}`,
      when: ph.createdAt,
      icon: "image",
      tone: WELL.neutral,
    });
  }
  for (const m of recentMembers) {
    activity.push({
      who: "Roster",
      what: "added a new member",
      when: m.createdAt,
      icon: "user",
      tone: WELL.attention,
    });
  }
  activity.sort((a, b) => b.when.getTime() - a.when.getTime());
  const feed = activity.slice(0, 8);

  const today = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <section className="flex flex-col gap-8">
      {/* Greeting and actions */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">
            {(org.unitType ?? "Org")} {org.unitNumber ?? ""} · This week · {today}
          </span>
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.03em] md:text-[36px]">
            {dayOfWeek(now)}
            <span className="text-muted">, {partOfDay(now)}.</span>
          </h1>
          <p className="text-[15px] text-ink-2">
            {upcomingEventsCount > 0
              ? `${upcomingEventsCount} upcoming event${upcomingEventsCount === 1 ? "" : "s"} · ${activeMembersCount} member${activeMembersCount === 1 ? "" : "s"} on roster`
              : "No upcoming events scheduled — add one to get started."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href={`/o/${slug}/admin/announcements`} className="btn-secondary no-underline">
            Send announcement
          </Link>
          <Link href={`/o/${slug}/admin/events/new`} className="btn-primary no-underline">
            + New event
          </Link>
        </div>
      </div>

      {/* Stats: one joined strip */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1.5 bg-surface p-5">
            <div className="text-[13px] text-muted">{s.label}</div>
            <div className="text-[30px] font-semibold leading-none tracking-[-0.02em] text-ink">
              {s.value}
            </div>
            <div className="text-[13px] text-muted">{s.hint}</div>
          </div>
        ))}
      </div>

      {/* Encryption status */}
      <Link
        href={`/o/${slug}/admin/security`}
        className={
          "inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-xs font-medium no-underline " +
          (vaultOk
            ? "bg-done-soft text-done-text hover:text-done-text"
            : "bg-attention-soft text-attention-text hover:text-attention-text")
        }
      >
        <span aria-hidden>{vaultOk ? "🔒" : "⚠"}</span>
        Encryption{" "}
        {vaultOk
          ? `enabled · key v${org.keyVersion}${org.keyRotatedAt ? ` · ${new Date(org.keyRotatedAt).toLocaleDateString()}` : ""}`
          : "not provisioned"}
      </Link>

      {/* Body: events + activity */}
      <div className="flex flex-wrap items-start gap-6">
        <section className="min-w-0 flex-[999_1_560px] rounded-xl border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-divider px-6 py-5">
            <div>
              <div className="eyebrow mb-1">§ Calendar</div>
              <h2 className="text-[17px] font-semibold tracking-[-0.01em]">What&apos;s coming up.</h2>
            </div>
            <Link href={`/o/${slug}/admin/events`} className="text-[13px] font-medium no-underline">
              All events →
            </Link>
          </div>
          {upcomingEvents.length === 0 ? (
            <p className="px-6 py-5 text-sm text-muted">
              No upcoming events. <Link href={`/o/${slug}/admin/events/new`}>Add one</Link>.
            </p>
          ) : (
            upcomingEvents.map((e) => (
              <Link
                key={e.id}
                href={`/o/${slug}/admin/events/${e.id}`}
                className="grid grid-cols-[64px_1fr] items-center gap-4 border-b border-divider px-6 py-4 text-ink no-underline transition-colors last:border-b-0 hover:bg-bg hover:text-ink sm:grid-cols-[64px_1fr_160px]"
              >
                <div className="flex h-14 w-14 flex-col items-center justify-center rounded-lg bg-sunk">
                  <span className="font-mono text-[11px] uppercase text-muted">{dayName(e.startsAt)}</span>
                  <span className="text-[15px] font-semibold leading-tight">{shortDate(e.startsAt)}</span>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-medium">{e.title}</div>
                  <div className="mt-0.5 text-[13px] text-muted">
                    {timeOfDay(e.startsAt)}
                    {e.location ? ` · ${e.location}` : ""}
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <div className="mb-1.5 text-[13px] text-muted">
                    {e._count.rsvps} RSVP{e._count.rsvps === 1 ? "" : "s"}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{
                        width: `${Math.min(
                          100,
                          (e._count.rsvps / Math.max(activeMembersCount, 1)) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </Link>
            ))
          )}
        </section>

        <section className="min-w-0 flex-[1_1_340px] rounded-xl border border-line bg-surface">
          <div className="border-b border-divider px-6 py-5">
            <div className="eyebrow mb-1">§ Activity</div>
            <h2 className="text-[17px] font-semibold tracking-[-0.01em]">The last few hours.</h2>
          </div>
          {feed.length === 0 ? (
            <p className="px-6 py-5 text-sm text-muted">No recent activity.</p>
          ) : (
            <div className="flex flex-col px-3 py-2">
              {feed.map((a, i) => (
                <div key={i} className="flex items-start gap-3.5 rounded-lg p-3">
                  <div className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-[10px] ${a.tone}`}>
                    <ActivityIcon icon={a.icon} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      <span className="font-medium">{a.who}</span>{" "}
                      <span className="text-ink-2">{a.what}</span>
                    </div>
                    <div className="mt-0.5 text-[13px] text-muted">{relativeTime(a.when, now)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
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
