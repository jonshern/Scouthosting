// Pure view-model builder for the admin dashboard.
//
// Splits "what the dashboard needs" from "how it's rendered" so the SQL
// shape can be tested without touching HTML, and so a future mobile or
// native dashboard can resolve colours its own way. Colour fields carry
// a semantic key (e.g. "sky") not a CSS string — the renderer maps it.
//
// Inputs are injected (prisma, orgId, now) so tests can pass a fake
// Prisma and a fixed clock.

/**
 * The palette keys the dashboard model emits. Must stay in sync with
 * the admin-shell CSS custom properties (--sky, --accent, …) — the
 * renderer turns "sky" into `var(--sky)` at the boundary.
 */
export const DASHBOARD_PALETTE = Object.freeze([
  "primary",
  "accent",
  "sky",
  "ember",
  "raspberry",
  "butter",
  "plum",
  "teal",
]);

// Category → colour key resolution lives in lib/eventCategories so the
// calendar, mobile app, and admin filters all share one source of truth.
import { categoryColor as _categoryColor } from "./eventCategories.js";
export const categoryColor = _categoryColor;

// "Tuesday" / "evening." — the greeting card's headline. Day name
// in regular weight, time-of-day in italic accent.
export function greetingFor(date = new Date()) {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const day = days[date.getDay()];
  const h = date.getHours();
  let phase;
  if (h < 5) phase = "late.";
  else if (h < 12) phase = "morning.";
  else if (h < 17) phase = "afternoon.";
  else if (h < 21) phase = "evening.";
  else phase = "night.";
  return { day, phase };
}

// Single Prisma-pass dashboard model. Everything is keyed off a stable
// `now` so tests don't flake.
export async function buildDashboardModel({ prisma, orgId, now = new Date() }) {
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    youthCount,
    adultCount,
    upcomingEvents,
    pendingReimbursements,
    pendingReimbursementsSum,
    unreadishMessages,
    photosThisWeek,
    recentPosts,
    recentRsvps,
    recentReimbursements,
    rosterPreview,
  ] = await Promise.all([
    prisma.member.count({ where: { orgId, isYouth: true } }),
    prisma.member.count({ where: { orgId, isYouth: false } }),
    prisma.event.findMany({
      where: { orgId, startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 4,
      include: { _count: { select: { rsvps: true } } },
    }),
    prisma.reimbursement.count({ where: { orgId, status: "pending" } }),
    prisma.reimbursement.aggregate({
      where: { orgId, status: "pending" },
      _sum: { amountCents: true },
    }),
    prisma.message.count({
      where: {
        orgId,
        createdAt: { gte: fourHoursAgo },
        deletedAt: null,
      },
    }),
    prisma.photo.count({ where: { orgId, createdAt: { gte: sevenDaysAgo } } }),
    prisma.post.findMany({
      where: { orgId },
      orderBy: { publishedAt: "desc" },
      take: 5,
      include: { author: { select: { displayName: true } } },
    }),
    prisma.rsvp.findMany({
      where: { orgId, response: "yes" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { event: { select: { title: true } } },
    }),
    prisma.reimbursement.findMany({
      where: { orgId },
      orderBy: { submittedAt: "desc" },
      take: 5,
    }),
    prisma.member.findMany({
      where: { orgId, isYouth: true },
      orderBy: { lastName: "asc" },
      take: 8,
      select: { id: true, firstName: true, lastName: true, patrol: true },
    }),
  ]);

  // For each event, count just the "yes" RSVPs (the include above counts
  // every RSVP including no/maybe). One follow-up groupBy keeps it cheap.
  const yesByEvent = upcomingEvents.length
    ? await prisma.rsvp.groupBy({
        by: ["eventId"],
        where: {
          orgId,
          response: "yes",
          eventId: { in: upcomingEvents.map((e) => e.id) },
        },
        _count: { _all: true },
      })
    : [];
  const yesMap = new Map(yesByEvent.map((row) => [row.eventId, row._count._all]));

  const events = upcomingEvents.map((e) => ({
    id: e.id,
    title: e.title,
    startsAt: e.startsAt,
    category: e.category,
    color: categoryColor(e.category),
    yes: yesMap.get(e.id) || 0,
    capacity: e.capacity || e._count.rsvps || 0,
  }));

  const activity = mergeActivity({
    posts: recentPosts,
    rsvps: recentRsvps,
    reimbursements: recentReimbursements,
  })
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 6);

  const greeting = greetingFor(now);

  return {
    greeting,
    stats: {
      scouts: { value: youthCount, hint: `${adultCount} adult leader${adultCount === 1 ? "" : "s"}`, color: "sky" },
      rsvps: {
        value: events[0] ? `${events[0].yes}/${events[0].capacity || "—"}` : "—",
        hint: events[0] ? events[0].title : "no upcoming events",
        color: "accent",
      },
      treasurer: {
        value: pendingReimbursements
          ? formatDollars(pendingReimbursementsSum._sum.amountCents || 0)
          : "$0",
        hint: pendingReimbursements
          ? `${pendingReimbursements} reimbursement${pendingReimbursements === 1 ? "" : "s"} pending`
          : "nothing pending",
        color: "butter",
      },
      messages: {
        value: unreadishMessages,
        hint: "messages in last 4 hours",
        color: "raspberry",
      },
    },
    events,
    activity,
    photosThisWeek,
    rosterPreview,
  };
}

function mergeActivity({ posts, rsvps, reimbursements }) {
  return [
    ...posts.map((p) => ({
      kind: "post",
      who: p.author?.displayName || "A leader",
      what: p.title ? `posted "${p.title}"` : "posted to the activity feed",
      at: p.publishedAt,
      color: "plum",
      icon: "post",
    })),
    ...rsvps.map((r) => ({
      kind: "rsvp",
      who: r.name,
      what: `said yes to ${r.event?.title || "an event"}`,
      at: r.createdAt,
      color: "accent",
      icon: "check",
    })),
    ...reimbursements.map((r) => ({
      kind: "reimbursement",
      who: r.requesterName,
      what: `requested ${formatDollars(r.amountCents)} · ${r.purpose.slice(0, 60)}`,
      at: r.submittedAt,
      color: "teal",
      icon: "cash",
    })),
  ];
}

function formatDollars(cents) {
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString("en-US")}`;
}
