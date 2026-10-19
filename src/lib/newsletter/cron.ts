// Newsletter cron — fires NewsletterSchedule + NewsletterRule rows.
//
// Pure-functional core: runCronTick({ now, prismaClient, logger })
// returns { schedulesDrafted, schedulesSkipped, rulesFired,
// errorLogsRetained, trashedMembersPurged }. No setInterval, no env
// reads — caller drives the clock. Deterministic + unit-testable.
//
// In compass-next, the loop side is driven by pg-boss (or an external
// scheduler hitting /api/cron/run); the function below is the unit
// of work.

import type { PrismaClient } from "@prisma/client";
import { logger as defaultLogger, type Logger } from "@/lib/log";
import { composeNewsletter } from "./index";
import { sweepChannelTwoDeep } from "@/lib/chat";
import { purgeExpiredScoutRecords } from "@/lib/retention/scouts";
import { sendMail, type MailMessage } from "@/lib/mail";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptField } from "@/lib/encryption";
import { runTrialReminderSweep } from "@/lib/billing/trial-reminders";
import { isConfigured as stripeConfigured } from "@/lib/billing/stripe";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DRAFT_GRACE_MS = 12 * HOUR_MS;

export function lastFireTime(
  args: { weekday: number; localTime: string | null; timezone?: string },
  now: Date = new Date(),
): Date {
  const [h, m] = String(args.localTime || "07:00")
    .split(":")
    .map((n) => parseInt(n, 10) || 0);
  const candidate = new Date(now);
  candidate.setHours(h, m, 0, 0);
  const todayJsDay = candidate.getDay();
  const todayIsoDay = todayJsDay === 0 ? 7 : todayJsDay;
  let dayDiff = todayIsoDay - args.weekday;
  if (dayDiff < 0) dayDiff += 7;
  if (dayDiff === 0 && candidate > now) dayDiff = 7;
  candidate.setDate(candidate.getDate() - dayDiff);
  return candidate;
}

const RULE_FLOOR_MS: Record<string, number> = {
  rsvp_nudge: HOUR_MS * 6,
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

function escapeMail(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

async function maybeDraftFromSchedule(args: {
  now: Date;
  sched: {
    orgId: string;
    weekday: number;
    localTime: string | null;
    timezone?: string | null;
    paused: boolean;
    minStories: number | null;
    lastDraftedAt: Date | null;
  };
  prismaClient: PrismaClient;
  logger: Logger;
}): Promise<"drafted" | "skipped" | null> {
  const { now, sched, prismaClient, logger } = args;
  const ref = lastFireTime(
    { weekday: sched.weekday, localTime: sched.localTime, timezone: sched.timezone ?? "UTC" },
    now,
  );
  if (now < ref) return null;
  if (sched.lastDraftedAt && sched.lastDraftedAt.getTime() >= ref.getTime() - DRAFT_GRACE_MS) {
    return null;
  }
  const composed = await composeNewsletter({ orgId: sched.orgId, now, prismaClient });
  const stories =
    (composed.posts?.length || 0) +
    (composed.events?.length || 0) +
    (composed.pastEvents?.length || 0);
  const minStories = sched.minStories ?? 2;
  if (stories < minStories) {
    await prismaClient.newsletterSchedule.update({
      where: { orgId: sched.orgId },
      data: { lastDraftedAt: now },
    });
    logger.info("schedule skipped (below minStories)", {
      orgId: sched.orgId,
      stories,
      minStories,
    });
    return "skipped";
  }
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

type RuleRow = {
  id: string;
  orgId: string;
  kind: string;
  enabled: boolean;
  lastFiredAt: Date | null;
  lastResult?: string | null;
};

async function maybeFireRule(args: {
  now: Date;
  rule: RuleRow;
  prismaClient: PrismaClient;
  logger: Logger;
}): Promise<boolean> {
  const { now, rule, prismaClient, logger } = args;
  const floor = RULE_FLOOR_MS[rule.kind] || HOUR_MS;
  if (rule.lastFiredAt && now.getTime() - rule.lastFiredAt.getTime() < floor) return false;

  let result: string;
  try {
    if (rule.kind === "rsvp_nudge") {
      result = await runRsvpNudgeHandler({ now, rule, prismaClient, logger });
    } else {
      result = `tick · scaffold (${rule.kind})`;
    }
  } catch (err) {
    result = `error · ${err instanceof Error ? err.message : String(err)}`.slice(0, 240);
    logger.warn("rule handler failed", {
      orgId: rule.orgId,
      kind: rule.kind,
      ruleId: rule.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  await prismaClient.newsletterRule.update({
    where: { id: rule.id },
    data: { lastFiredAt: now, lastResult: result },
  });
  logger.info("rule tick fired", { orgId: rule.orgId, kind: rule.kind, ruleId: rule.id, result });
  return true;
}

export async function runRsvpNudgeHandler(args: {
  now?: Date;
  rule: { orgId: string };
  prismaClient: PrismaClient;
  logger?: Logger;
}): Promise<string> {
  const {
    now = new Date(),
    rule,
    prismaClient,
    logger = defaultLogger.child("rsvp-nudge"),
  } = args;
  const orgId = rule.orgId;
  const horizon = new Date(now.getTime() + 7 * DAY_MS);

  const [org, events, rawMembers] = await Promise.all([
    prismaClient.org.findUnique({
      where: { id: orgId },
      select: { id: true, slug: true, displayName: true, encryptedDek: true },
    }),
    prismaClient.event.findMany({
      where: { orgId, signupRequired: true, startsAt: { gte: now, lte: horizon } },
      orderBy: { startsAt: "asc" },
      include: { rsvps: { select: { userId: true, email: true } } },
    }),
    prismaClient.member.findMany({
      where: {
        orgId,
        email: { not: null },
        emailUnsubscribed: false,
        bouncedAt: null,
        NOT: { commPreference: "none" },
      },
      select: { id: true, encFirstName: true, encLastName: true, email: true },
    }),
  ]);

  if (!org || !org.encryptedDek || events.length === 0 || rawMembers.length === 0) {
    return `0 events × ${rawMembers.length} members → 0 nudges`;
  }
  const dek = unwrapDekWithMaster(org);
  const members = rawMembers.map((m) => ({
    id: m.id,
    email: m.email,
    firstName: decryptField(m.encFirstName, dek, orgId, "member.firstName") ?? "",
    lastName: decryptField(m.encLastName, dek, orgId, "member.lastName") ?? "",
  }));

  const apex = process.env.APEX_DOMAIN || "compass.app";
  const messages: MailMessage[] = [];
  let eventsTouched = 0;
  for (const ev of events) {
    const respondedEmails = new Set(
      ev.rsvps.map((r) => (r.email || "").toLowerCase()).filter(Boolean),
    );
    const unresponded = members.filter((m) => {
      const email = (m.email || "").toLowerCase();
      return email && !respondedEmails.has(email);
    });
    if (!unresponded.length) continue;
    eventsTouched += 1;
    for (const m of unresponded) {
      const url = `https://${org.slug}.${apex}/events/${ev.id}`;
      const when = ev.startsAt.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const subject = `Quick RSVP: ${ev.title}`;
      const text = `Hi ${m.firstName || ""},

We haven't heard back from you about ${ev.title} on ${when}. ${ev.location ? "We'll be at " + ev.location + ". " : ""}A quick yes/no helps the leaders plan.

RSVP here: ${url}

— ${org.displayName}`;
      const html = `<p>Hi ${escapeMail(m.firstName || "")},</p><p>We haven't heard back from you about <strong>${escapeMail(ev.title)}</strong> on ${escapeMail(when)}. ${ev.location ? "We'll be at " + escapeMail(ev.location) + ". " : ""}A quick yes/no helps the leaders plan.</p><p><a href="${escapeMail(url)}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">RSVP for ${escapeMail(ev.title)}</a></p><p>— ${escapeMail(org.displayName)}</p>`;
      messages.push({ to: m.email!, subject, html, text });
    }
  }

  if (!messages.length) {
    return `${events.length} events · all responded → 0 nudges`;
  }
  let sent = 0;
  for (const msg of messages) {
    const r = await sendMail(msg);
    if (r.ok) sent++;
  }
  logger.info("rsvp_nudge sent", { orgId, eventsTouched, sent });
  return `${eventsTouched} event${eventsTouched === 1 ? "" : "s"} · ${sent} nudge${sent === 1 ? "" : "s"} sent`;
}

export type CronTickResult = {
  schedulesDrafted: number;
  schedulesSkipped: number;
  rulesFired: number;
  errorLogsRetained: number;
  trashedMembersPurged: number;
  scoutRecordsPurged: number;
  channelsSuspended: number;
  authRowsPurged: number;
  trialReminders: number;
};

/** Delete expired sessions and verifications, and sign-in rate-limit
 *  rows idle for a day. Returns the number of rows removed. */
export async function pruneAuthRows(args: { now: Date; prismaClient: PrismaClient }): Promise<number> {
  const { now, prismaClient } = args;
  const dayAgo = BigInt(now.getTime() - DAY_MS);
  const [sessions, verifications, limits] = await Promise.all([
    prismaClient.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prismaClient.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
    prismaClient.rateLimit.deleteMany({ where: { lastRequest: { lt: dayAgo } } }),
  ]);
  return sessions.count + verifications.count + limits.count;
}

export async function runCronTick(opts: {
  now?: Date;
  prismaClient: PrismaClient;
  logger?: Logger;
}): Promise<CronTickResult> {
  const { now = new Date(), prismaClient, logger = defaultLogger.child("cron") } = opts;
  if (!prismaClient) throw new Error("runCronTick: missing prismaClient");

  const schedules = await prismaClient.newsletterSchedule.findMany({
    where: { paused: false },
  });
  let schedulesDrafted = 0;
  let schedulesSkipped = 0;
  for (const sched of schedules) {
    try {
      const ran = await maybeDraftFromSchedule({
        now,
        sched: {
          orgId: sched.orgId,
          weekday: sched.weekday,
          localTime: sched.localTime,
          timezone: sched.timezone,
          paused: sched.paused,
          minStories: sched.minStories,
          lastDraftedAt: sched.lastDraftedAt,
        },
        prismaClient,
        logger,
      });
      if (ran === "drafted") schedulesDrafted += 1;
      if (ran === "skipped") schedulesSkipped += 1;
    } catch (err) {
      logger.warn("schedule tick failed", {
        orgId: sched.orgId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const rules = await prismaClient.newsletterRule.findMany({ where: { enabled: true } });
  let rulesFired = 0;
  for (const rule of rules) {
    try {
      const fired = await maybeFireRule({
        now,
        rule: {
          id: rule.id,
          orgId: rule.orgId,
          kind: rule.kind,
          enabled: rule.enabled,
          lastFiredAt: rule.lastFiredAt,
          lastResult: rule.lastResult,
        },
        prismaClient,
        logger,
      });
      if (fired) rulesFired += 1;
    } catch (err) {
      logger.warn("rule tick failed", {
        ruleId: rule.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let errorLogsRetained = 0;
  try {
    const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const result = await prismaClient.errorLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    errorLogsRetained = result.count;
  } catch (err) {
    logger.warn("errorLog retention sweep failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  let trashedMembersPurged = 0;
  try {
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const result = await prismaClient.member.deleteMany({
      where: { deletedAt: { lt: cutoff } },
    });
    trashedMembersPurged = result.count;
  } catch (err) {
    logger.warn("member trash sweep failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // Youth record retention: 18 months after a scout turns 18 or leaves.
  let scoutRecordsPurged = 0;
  try {
    scoutRecordsPurged = (await purgeExpiredScoutRecords({ now, prismaClient })).purged;
  } catch (err) {
    logger.warn("scout retention sweep failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // Youth-protection backstop: suspend channels that have drifted below
  // two-deep since their last post.
  let channelsSuspended = 0;
  try {
    channelsSuspended = (await sweepChannelTwoDeep({ now, prismaClient })).suspended;
  } catch (err) {
    logger.warn("two-deep sweep failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // Sign-in housekeeping. Better Auth deletes an expired session only
  // when it's presented again, so abandoned ones (and used sign-in
  // tokens, and per-IP sign-in rate-limit rows) would pile up forever.
  let authRowsPurged = 0;
  try {
    authRowsPurged = await pruneAuthRows({ now, prismaClient });
  } catch (err) {
    logger.warn("auth housekeeping failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // Trial-end reminders to unit owners (7 days and 1 day out).
  let trialReminders = 0;
  try {
    trialReminders = (
      await runTrialReminderSweep({ prisma: prismaClient, stripeConfigured: stripeConfigured(), now })
    ).reminded;
  } catch (err) {
    logger.warn("trial reminder sweep failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    schedulesDrafted,
    schedulesSkipped,
    rulesFired,
    errorLogsRetained,
    trashedMembersPurged,
    scoutRecordsPurged,
    channelsSuspended,
    authRowsPurged,
    trialReminders,
  };
}
