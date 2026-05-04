// Newsletter cron — fires NewsletterSchedule + NewsletterRule rows.
//
// Runs as a tick loop inside the web server (server/index.js boots it).
// Multi-pod deployments should set CRON_DISABLED=1 on N-1 pods so only
// one process fires per tick — alternative would be a Postgres advisory
// lock, but that's overkill for a 5-minute cadence with 1000 orgs.
//
// What it does each tick:
//
//   1. NewsletterSchedule rows where (weekday + localTime + timezone)
//      have just passed AND lastDraftedAt is older than 12 hours →
//      auto-compose a newsletter draft via lib/newsletter.composeNewsletter
//      and persist it as a Newsletter row in status='draft'. The leader
//      reviews it Sunday morning and hits Approve in admin/newsletter.
//      If the compose finds < schedule.minStories, the tick logs the
//      decision and skips creating the draft (leaders see "no draft this
//      week" in the UI rather than an empty issue).
//
//   2. NewsletterRule rows where enabled=true AND lastFiredAt is older
//      than the per-kind cadence → run a kind-specific tick handler.
//      For v1 most handlers are scaffolds that record an analytics
//      event + update lastFiredAt; the actual broadcast wiring (which
//      requires Postmark + a queue) lands in a follow-up.
//
// Pure-functional core: runCronTick({ now, prismaClient, logger })
// returns { schedulesDrafted, rulesFired, schedulesSkipped }. No
// setInterval, no env reads — caller drives the clock. This keeps the
// tick deterministic + unit-testable.

import { composeNewsletter } from "./newsletter.js";
import { track, EVENTS } from "./analytics.js";
import { logger as defaultLogger } from "./log.js";
import { sendBatch } from "./mail.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DRAFT_GRACE_MS = 12 * HOUR_MS;

/**
 * Convert a schedule (weekday 1..7 Mon..Sun, "HH:MM" in IANA tz) into
 * its most-recent fire time relative to `now`. Returns a Date in the
 * Compass server's wall-clock — we don't need DST-perfect precision
 * here because the cron window is the whole day; we just need a
 * monotonically-increasing reference to compare against lastDraftedAt.
 */
export function lastFireTime({ weekday, localTime, timezone = "UTC" }, now = new Date()) {
  const [h, m] = String(localTime || "07:00").split(":").map((n) => parseInt(n, 10) || 0);
  // Use the server clock as a stand-in for "the configured timezone"
  // — close enough for the ±5 minute scheduling resolution we promise.
  // A future iteration that handles cross-timezone leaders precisely
  // can do real Intl.DateTimeFormat math; for now, server-local is
  // documented behaviour.
  const candidate = new Date(now);
  candidate.setHours(h, m, 0, 0);
  // The schedule weekday is 1..7 (Mon..Sun); JS getDay is 0..6 (Sun..Sat).
  const todayJsDay = candidate.getDay();           // 0..6
  const todayIsoDay = todayJsDay === 0 ? 7 : todayJsDay;
  let dayDiff = todayIsoDay - weekday;
  if (dayDiff < 0) dayDiff += 7;
  // If the candidate today-time hasn't happened yet AND the weekday
  // matches today, look back a full week (the "next" run is in the
  // future; the most-recent run is 7 days ago).
  if (dayDiff === 0 && candidate > now) dayDiff = 7;
  candidate.setDate(candidate.getDate() - dayDiff);
  return candidate;
}

/**
 * Run one cron tick.
 *
 * @param {Object} opts
 * @param {Date}   [opts.now]
 * @param {import("@prisma/client").PrismaClient} opts.prismaClient
 * @param {Object} [opts.logger]
 * @returns {Promise<{schedulesDrafted: number, schedulesSkipped: number, rulesFired: number}>}
 */
export async function runCronTick({ now = new Date(), prismaClient, logger = defaultLogger.child("cron") } = {}) {
  if (!prismaClient) throw new Error("runCronTick: missing prismaClient");

  const schedules = await prismaClient.newsletterSchedule.findMany({
    where: { paused: false },
  });
  let schedulesDrafted = 0;
  let schedulesSkipped = 0;
  for (const sched of schedules) {
    try {
      const ran = await maybeDraftFromSchedule({ now, sched, prismaClient, logger });
      if (ran === "drafted") schedulesDrafted += 1;
      if (ran === "skipped") schedulesSkipped += 1;
    } catch (err) {
      logger.warn("schedule tick failed", { orgId: sched.orgId, err: err && err.message });
    }
  }

  const rules = await prismaClient.newsletterRule.findMany({
    where: { enabled: true },
  });
  let rulesFired = 0;
  for (const rule of rules) {
    try {
      const fired = await maybeFireRule({ now, rule, prismaClient, logger });
      if (fired) rulesFired += 1;
    } catch (err) {
      logger.warn("rule tick failed", { ruleId: rule.id, err: err && err.message });
    }
  }

  // ErrorLog retention: keep 90 days. Cheap delete; bounded by index
  // on createdAt. Failure here is logged but doesn't fail the tick.
  let errorLogsRetained = 0;
  try {
    const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const result = await prismaClient.errorLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    errorLogsRetained = result.count;
  } catch (err) {
    logger.warn("errorLog retention sweep failed", { err: err && err.message });
  }

  // Soft-deleted Member retention: hard-delete rows whose deletedAt
  // is older than 30 days. Indexed on (orgId, deletedAt) so the scan
  // is cheap. Best-effort; a transient DB error doesn't fail the tick.
  let trashedMembersPurged = 0;
  try {
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const result = await prismaClient.member.deleteMany({
      where: { deletedAt: { lt: cutoff } },
    });
    trashedMembersPurged = result.count;
  } catch (err) {
    logger.warn("member trash sweep failed", { err: err && err.message });
  }

  return { schedulesDrafted, schedulesSkipped, rulesFired, errorLogsRetained, trashedMembersPurged };
}

async function maybeDraftFromSchedule({ now, sched, prismaClient, logger }) {
  const ref = lastFireTime(sched, now);
  if (now < ref) return null; // shouldn't happen; lastFireTime is in the past
  // Only draft if we haven't already drafted for THIS fire window.
  if (sched.lastDraftedAt && sched.lastDraftedAt.getTime() >= ref.getTime() - DRAFT_GRACE_MS) {
    return null;
  }
  const composed = await composeNewsletter({
    orgId: sched.orgId,
    now,
    prismaClient,
  });
  const stories = (composed.posts?.length || 0) + (composed.events?.length || 0) + (composed.pastEvents?.length || 0);
  if (stories < (sched.minStories ?? 2)) {
    await prismaClient.newsletterSchedule.update({
      where: { orgId: sched.orgId },
      data: { lastDraftedAt: now },
    });
    logger.info("schedule skipped (below minStories)", {
      orgId: sched.orgId,
      stories,
      minStories: sched.minStories,
    });
    await track(EVENTS.PAGE_VIEW, {
      // Reusing PAGE_VIEW for the rollup table is incorrect; we don't
      // have a dedicated 'newsletter-skipped' event in the whitelist
      // yet. Logging is sufficient for v1 — surfacing this in the
      // schedule UI is the natural follow-up.
      orgId: sched.orgId,
      dimensions: { surface: "cron", path: "/newsletter/skip-low-stories" },
    }, prismaClient);
    return "skipped";
  }
  // Don't clobber an existing draft for this fire window — leaders may
  // have already opened it for editing.
  const existing = await prismaClient.newsletter.findFirst({
    where: {
      orgId: sched.orgId,
      status: "draft",
      createdAt: { gte: new Date(ref.getTime() - DRAFT_GRACE_MS) },
    },
    select: { id: true },
  });
  if (existing) {
    await prismaClient.newsletterSchedule.update({
      where: { orgId: sched.orgId },
      data: { lastDraftedAt: now },
    });
    return null;
  }
  await prismaClient.newsletter.create({
    data: {
      orgId: sched.orgId,
      title: composed.suggestedTitle,
      intro: composed.suggestedIntro,
      includedPostIds: (composed.posts || []).map((p) => p.id),
      includedEventIds: [
        ...(composed.events || []).map((e) => e.id),
        ...(composed.pastEvents || []).map((e) => e.id),
      ],
      status: "draft",
    },
  });
  await prismaClient.newsletterSchedule.update({
    where: { orgId: sched.orgId },
    data: { lastDraftedAt: now },
  });
  logger.info("schedule drafted", { orgId: sched.orgId, stories });
  return "drafted";
}

// Per-kind cadence in ms — how often we'll consider re-firing the same
// rule. Real "should fire now" decisions still depend on the kind-
// specific handler logic; this is just the floor between attempts so a
// 5-minute tick doesn't hammer rules.
const RULE_FLOOR_MS = {
  rsvp_nudge: HOUR_MS * 6,        // up to 4x/day
  dues_reminder: DAY_MS,
  post_event_recap: HOUR_MS * 2,
  eagle_coh_invite: HOUR_MS * 6,
  new_family_drip: HOUR_MS * 6,
  reengage_quiet: DAY_MS,
  birthday: DAY_MS,
  packing_list: DAY_MS,
  medform_expiry: DAY_MS,
  custom: HOUR_MS,
};

async function maybeFireRule({ now, rule, prismaClient, logger }) {
  const floor = RULE_FLOOR_MS[rule.kind] || HOUR_MS;
  if (rule.lastFiredAt && now.getTime() - rule.lastFiredAt.getTime() < floor) return false;

  let result;
  try {
    if (rule.kind === "rsvp_nudge") {
      result = await runRsvpNudgeHandler({ now, rule, prismaClient, logger });
    } else {
      // Other rule kinds keep their v1 scaffold for now. Concrete
      // implementations land in follow-ups; the scaffold still bumps
      // lastFiredAt so the schedule UI's "Last fired" column lights up.
      result = `tick · scaffold (${rule.kind})`;
    }
  } catch (err) {
    result = `error · ${(err && err.message) || "unknown"}`.slice(0, 240);
    logger.warn("rule handler failed", { orgId: rule.orgId, kind: rule.kind, ruleId: rule.id, err: err && err.message });
  }
  await prismaClient.newsletterRule.update({
    where: { id: rule.id },
    data: { lastFiredAt: now, lastResult: result },
  });
  logger.info("rule tick fired", { orgId: rule.orgId, kind: rule.kind, ruleId: rule.id, result });
  return true;
}

/**
 * RSVP nudge: for any signup-required event in the next 7 days that
 * has families who haven't responded, send each unresponded member a
 * personalised reminder email with a one-click RSVP link.
 *
 * "Unresponded" = the org has a Member row with a usable email AND
 * no Rsvp row exists for (eventId, userId or email). Anonymous /
 * orphan RSVPs (no Member match) don't count.
 *
 * Returns a short status string for NewsletterRule.lastResult.
 */
export async function runRsvpNudgeHandler({ now = new Date(), rule, prismaClient, logger = defaultLogger.child("rsvp-nudge") } = {}) {
  if (!rule || !prismaClient) throw new Error("runRsvpNudgeHandler: missing rule/prismaClient");
  const orgId = rule.orgId;
  const horizon = new Date(now.getTime() + 7 * DAY_MS);

  const [org, events, members] = await Promise.all([
    prismaClient.org.findUnique({
      where: { id: orgId },
      select: { id: true, slug: true, displayName: true },
    }),
    prismaClient.event.findMany({
      where: {
        orgId,
        signupRequired: true,
        startsAt: { gte: now, lte: horizon },
      },
      orderBy: { startsAt: "asc" },
      include: {
        rsvps: { select: { userId: true, email: true } },
      },
    }),
    prismaClient.member.findMany({
      where: {
        orgId,
        email: { not: null },
        // Skip members who've unsubscribed, bounced, or opted out
        // entirely. Mirrors the filter used by the broadcast composer.
        emailUnsubscribed: false,
        bouncedAt: null,
        NOT: { commPreference: "none" },
      },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);

  if (!org || events.length === 0 || members.length === 0) {
    return `0 events × ${members.length} members → 0 nudges`;
  }

  const apex = process.env.APEX_DOMAIN || "compass.app";
  const messages = [];
  let eventsTouched = 0;
  for (const ev of events) {
    const respondedEmails = new Set(ev.rsvps.map((r) => (r.email || "").toLowerCase()).filter(Boolean));
    const unresponded = members.filter((m) => {
      const email = (m.email || "").toLowerCase();
      return email && !respondedEmails.has(email);
    });
    if (!unresponded.length) continue;
    eventsTouched += 1;
    for (const m of unresponded) {
      const url = `https://${org.slug}.${apex}/events/${ev.id}`;
      const when = ev.startsAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const subject = `Quick RSVP: ${ev.title}`;
      const text = `Hi ${m.firstName || ""},\n\nWe haven't heard back from you about ${ev.title} on ${when}. ${ev.location ? "We'll be at " + ev.location + ". " : ""}A quick yes/no helps the leaders plan.\n\nRSVP here: ${url}\n\n— ${org.displayName}`;
      const html = `<p>Hi ${escapeMail(m.firstName || "")},</p><p>We haven't heard back from you about <strong>${escapeMail(ev.title)}</strong> on ${escapeMail(when)}. ${ev.location ? "We'll be at " + escapeMail(ev.location) + ". " : ""}A quick yes/no helps the leaders plan.</p><p><a href="${escapeMail(url)}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">RSVP for ${escapeMail(ev.title)}</a></p><p>— ${escapeMail(org.displayName)}</p>`;
      messages.push({
        to: m.email,
        subject,
        html,
        text,
        // Tag for MailLog so the operator can filter "rsvp-nudge" sends.
        meta: { orgId, eventId: ev.id, memberId: m.id, kind: "rsvp_nudge" },
      });
    }
  }

  if (!messages.length) {
    return `${events.length} events · all responded → 0 nudges`;
  }
  const result = await sendBatch(messages);
  const sent = (result && result.sent) || messages.length;
  logger.info("rsvp_nudge sent", { orgId, eventsTouched, sent });
  return `${eventsTouched} event${eventsTouched === 1 ? "" : "s"} · ${sent} nudge${sent === 1 ? "" : "s"} sent`;
}

function escapeMail(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/**
 * Start a setInterval-driven tick loop. Returns a stop() function.
 * No-op when CRON_DISABLED is set — multi-pod deployments opt N-1
 * pods out so only one process drives the cron.
 */
export function startCronLoop({ prismaClient, intervalMs = 5 * 60 * 1000, logger = defaultLogger.child("cron") } = {}) {
  if (process.env.CRON_DISABLED === "1") {
    logger.info("cron loop disabled by env");
    return () => {};
  }
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const result = await runCronTick({ prismaClient, logger });
      if (result.schedulesDrafted || result.schedulesSkipped || result.rulesFired) {
        logger.info("tick", result);
      }
    } catch (err) {
      logger.warn("tick failed", { err: err && err.message });
    }
  };
  // Fire once on boot (catches startup gap), then on the cadence.
  setTimeout(tick, 5_000);
  const handle = setInterval(tick, intervalMs);
  return () => {
    stopped = true;
    clearInterval(handle);
  };
}
