"use server";

// Owner console (/super-admin) writes. Every action checks origin,
// CSRF and isSuperAdmin, and leaves an AuditLog row naming the owner.
// None of them call Stripe: trial and comp dates are Compass's own, and
// a unit's Stripe subscription is changed in Stripe.

import { redirect } from "next/navigation";
import { z } from "zod";
import { type Plan } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession, type SessionUser } from "@/lib/auth/session";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { extendedTrialEnd } from "@/lib/owner/license";
import { disableAccount, enableAccount } from "@/lib/owner/access";
import { replyToTicket, STATUSES } from "@/lib/owner/inbox";
import { saveSignupReview, SIGNUP_STATUSES } from "@/lib/owner/signups";
import { sendInvite, sendPlanReminder } from "@/lib/owner/signup-mail";
import { auth } from "@/lib/auth/auth";

const PLANS = new Set<Plan>(["patrol", "troop", "council"]);

async function authorizeOwner(formData: FormData): Promise<SessionUser> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const { user } = await getSession();
  if (!user || !user.isSuperAdmin) throw new Error("Forbidden.");
  return user;
}

function parse<T extends z.ZodTypeAny>(schema: T, formData: FormData): z.infer<T> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input.");
  return parsed.data;
}

async function orgOrThrow(orgId: string) {
  const org = await prisma.org.findUnique({ where: { id: orgId } });
  if (!org) throw new Error("Unit not found.");
  return org;
}

function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function unitPage(slug: string, done: string): never {
  redirect(`/super-admin/orgs/${slug}?done=${encodeURIComponent(done)}`);
}

const SuspendSchema = z.object({
  orgId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
});

export async function suspendOrgAction(formData: FormData): Promise<void> {
  const user = await authorizeOwner(formData);
  const input = parse(SuspendSchema, formData);
  const org = await orgOrThrow(input.orgId);
  await prisma.org.update({
    where: { id: org.id },
    data: { suspendedAt: new Date(), suspendedReason: input.reason },
  });
  audit({
    orgId: org.id,
    userId: user.id,
    userDisplay: user.displayName,
    entityType: "Org",
    entityId: org.id,
    action: "org.suspend",
    summary: input.reason,
  });
  unitPage(org.slug, "Suspended.");
}

const OrgIdSchema = z.object({ orgId: z.string().min(1) });

export async function restoreOrgAction(formData: FormData): Promise<void> {
  const user = await authorizeOwner(formData);
  const input = parse(OrgIdSchema, formData);
  const org = await orgOrThrow(input.orgId);
  await prisma.org.update({
    where: { id: org.id },
    data: { suspendedAt: null, suspendedReason: null },
  });
  audit({
    orgId: org.id,
    userId: user.id,
    userDisplay: user.displayName,
    entityType: "Org",
    entityId: org.id,
    action: "org.restore",
  });
  unitPage(org.slug, "Reinstated.");
}

const ChangePlanSchema = z.object({
  orgId: z.string().min(1),
  plan: z.string().min(1),
});

export async function changeOrgPlanAction(formData: FormData): Promise<void> {
  const user = await authorizeOwner(formData);
  const input = parse(ChangePlanSchema, formData);
  if (!PLANS.has(input.plan as Plan)) throw new Error("Bad plan.");
  const org = await orgOrThrow(input.orgId);
  await prisma.org.update({
    where: { id: org.id },
    data: { plan: input.plan as Plan },
  });
  audit({
    orgId: org.id,
    userId: user.id,
    userDisplay: user.displayName,
    entityType: "Org",
    entityId: org.id,
    action: "org.plan_change",
    summary: `${org.plan} → ${input.plan}`,
  });
  unitPage(org.slug, "Plan changed.");
}

const ExtendTrialSchema = z.object({
  orgId: z.string().min(1),
  days: z.coerce.number().int().min(1, "Pick 1 to 365 days.").max(365, "Pick 1 to 365 days."),
});

export async function extendTrialAction(formData: FormData): Promise<void> {
  const user = await authorizeOwner(formData);
  const input = parse(ExtendTrialSchema, formData);
  const org = await orgOrThrow(input.orgId);
  // With a Stripe subscription, Stripe's own trial end decides when the
  // card is charged; moving ours would only make the two disagree.
  if (org.stripeSubscriptionId) {
    unitPage(org.slug, "This unit already subscribed, so its trial is Stripe's. Give free access instead.");
  }
  const ends = extendedTrialEnd(org.trialEndsAt, input.days);
  await prisma.org.update({
    where: { id: org.id },
    // A trial that ran out comes back as a trial.
    data: { trialEndsAt: ends, subscriptionStatus: "trialing" },
  });
  audit({
    orgId: org.id,
    userId: user.id,
    userDisplay: user.displayName,
    entityType: "Org",
    entityId: org.id,
    action: "org.trial_extend",
    summary: `+${input.days} days, trial ends ${day(ends)} (was ${org.trialEndsAt ? day(org.trialEndsAt) : "none"})`,
  });
  unitPage(org.slug, `Trial now ends ${day(ends)}.`);
}

const CompSchema = z.object({
  orgId: z.string().min(1),
  until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an end date.")
    .transform((s) => new Date(`${s}T23:59:59.000Z`)),
  note: z.string().trim().max(200).optional().default(""),
});

export async function compOrgAction(formData: FormData): Promise<void> {
  const user = await authorizeOwner(formData);
  const input = parse(CompSchema, formData);
  if (input.until.getTime() <= Date.now()) throw new Error("Pick a date after today.");
  const org = await orgOrThrow(input.orgId);
  await prisma.org.update({
    where: { id: org.id },
    data: { compedUntil: input.until, compedNote: input.note || null },
  });
  audit({
    orgId: org.id,
    userId: user.id,
    userDisplay: user.displayName,
    entityType: "Org",
    entityId: org.id,
    action: "org.comp",
    summary: `Free access until ${day(input.until)}${input.note ? `: ${input.note}` : ""}`,
  });
  unitPage(org.slug, `Free access until ${day(input.until)}.`);
}

export async function endCompAction(formData: FormData): Promise<void> {
  const user = await authorizeOwner(formData);
  const input = parse(OrgIdSchema, formData);
  const org = await orgOrThrow(input.orgId);
  await prisma.org.update({
    where: { id: org.id },
    data: { compedUntil: null, compedNote: null },
  });
  audit({
    orgId: org.id,
    userId: user.id,
    userDisplay: user.displayName,
    entityType: "Org",
    entityId: org.id,
    action: "org.comp_end",
    summary: org.compedUntil ? `Was free until ${day(org.compedUntil)}` : null,
  });
  unitPage(org.slug, "Free access ended.");
}

const DisableSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().trim().min(1, "Say why.").max(500),
});

export async function disableAccountAction(formData: FormData): Promise<void> {
  const owner = await authorizeOwner(formData);
  const input = parse(DisableSchema, formData);
  if (input.userId === owner.id) throw new Error("You can't turn off your own account.");
  const { user, revoked } = await disableAccount(input.userId, input.reason);
  audit({
    userId: owner.id,
    userDisplay: owner.displayName,
    entityType: "User",
    entityId: user.id,
    action: "user.disable",
    summary:
      `${user.email}: ${input.reason} (revoked ${revoked.sessions} sessions, ${revoked.appTokens} app tokens, ` +
      `${revoked.connectorTokens} connector tokens, ${revoked.scoutDevices} scout devices)`,
  });
  redirect(`/super-admin/people/${user.id}?done=${encodeURIComponent("Account turned off.")}`);
}

const UserIdSchema = z.object({ userId: z.string().min(1) });

export async function enableAccountAction(formData: FormData): Promise<void> {
  const owner = await authorizeOwner(formData);
  const input = parse(UserIdSchema, formData);
  const user = await enableAccount(input.userId);
  audit({
    userId: owner.id,
    userDisplay: owner.displayName,
    entityType: "User",
    entityId: user.id,
    action: "user.enable",
    summary: user.email,
  });
  redirect(`/super-admin/people/${user.id}?done=${encodeURIComponent("Account turned back on.")}`);
}

function inboxPage(id: string, done: string): never {
  redirect(`/super-admin/inbox/${id}?done=${encodeURIComponent(done)}`);
}

const ReplySchema = z.object({
  ticketId: z.string().min(1),
  body: z.string().trim().min(1, "Write a reply.").max(8000),
});

export async function replyToTicketAction(formData: FormData): Promise<void> {
  const owner = await authorizeOwner(formData);
  const input = parse(ReplySchema, formData);
  const { emailed, error } = await replyToTicket({ ticketId: input.ticketId, body: input.body, author: owner });
  audit({
    userId: owner.id,
    userDisplay: owner.displayName,
    entityType: "SupportTicket",
    entityId: input.ticketId,
    action: "support.reply",
    summary: emailed ? "Replied by email" : `Reply saved; email failed: ${error}`,
  });
  inboxPage(input.ticketId, emailed ? "Reply sent." : `Reply saved, but the email didn't go out: ${error}`);
}

const TicketStatusSchema = z.object({
  ticketId: z.string().min(1),
  status: z.enum(STATUSES),
});

export async function setTicketStatusAction(formData: FormData): Promise<void> {
  const owner = await authorizeOwner(formData);
  const input = parse(TicketStatusSchema, formData);
  const ticket = await prisma.supportTicket.update({
    where: { id: input.ticketId },
    data: { status: input.status, resolvedAt: input.status === "closed" ? new Date() : null },
    select: { id: true, orgId: true },
  });
  audit({
    orgId: ticket.orgId,
    userId: owner.id,
    userDisplay: owner.displayName,
    entityType: "SupportTicket",
    entityId: ticket.id,
    action: `support.${input.status}`,
  });
  inboxPage(ticket.id, input.status === "closed" ? "Closed." : input.status === "open" ? "Reopened." : "Marked answered.");
}

const FixSchema = z.object({
  fingerprint: z.string().regex(/^[0-9a-f]{40}$/),
  note: z.string().trim().max(200).optional().default(""),
});

export async function markErrorFixedAction(formData: FormData): Promise<void> {
  const owner = await authorizeOwner(formData);
  const input = parse(FixSchema, formData);
  const now = new Date();
  await prisma.errorResolution.upsert({
    where: { fingerprint: input.fingerprint },
    create: { fingerprint: input.fingerprint, resolvedAt: now, resolvedById: owner.id, note: input.note || null },
    update: { resolvedAt: now, resolvedById: owner.id, note: input.note || null },
  });
  audit({
    userId: owner.id,
    userDisplay: owner.displayName,
    entityType: "ErrorLog",
    entityId: input.fingerprint,
    action: "error.fixed",
    summary: input.note || null,
  });
  redirect(`/super-admin/errors/${input.fingerprint}?done=${encodeURIComponent("Marked fixed. It comes back if it happens again.")}`);
}

export async function reopenErrorAction(formData: FormData): Promise<void> {
  const owner = await authorizeOwner(formData);
  const input = parse(FixSchema, formData);
  await prisma.errorResolution.deleteMany({ where: { fingerprint: input.fingerprint } });
  audit({
    userId: owner.id,
    userDisplay: owner.displayName,
    entityType: "ErrorLog",
    entityId: input.fingerprint,
    action: "error.reopened",
  });
  redirect(`/super-admin/errors/${input.fingerprint}?done=${encodeURIComponent("Reopened.")}`);
}

// ── Sign-ups queue ──────────────────────────────────────────────────
// Each write returns to the queue with its filters (the "back" field,
// checked to stay on /super-admin/signups).

const BACK = /^\/super-admin\/signups(\?[\w=&%.-]*)?$/;

function signupsPage(formData: FormData, done: string): never {
  const back = String(formData.get("back") ?? "");
  const base = BACK.test(back) ? back : "/super-admin/signups";
  redirect(`${base}${base.includes("?") ? "&" : "?"}done=${encodeURIComponent(done)}`);
}

const SignupRefSchema = z.object({
  entityType: z.enum(["Org", "User"]),
  entityId: z.string().min(1),
});

const optionalDay = z
  .string()
  .optional()
  .transform((s, ctx) => {
    if (!s) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      ctx.addIssue({ code: "custom", message: "Pick a follow-up day." });
      return z.NEVER;
    }
    return new Date(`${s}T12:00:00.000Z`);
  });

const SaveSignupSchema = SignupRefSchema.extend({
  // Declining turns the unit or account off, so it has its own action.
  status: z.enum(SIGNUP_STATUSES).refine((s) => s !== "declined", "Use Decline to decline."),
  note: z.string().trim().max(2000).optional().default(""),
  followUpOn: optionalDay,
});

async function signupName(entityType: "Org" | "User", entityId: string): Promise<{ name: string; orgId: string | null }> {
  if (entityType === "Org") {
    const org = await orgOrThrow(entityId);
    return { name: org.displayName, orgId: org.id };
  }
  const user = await prisma.user.findUnique({ where: { id: entityId }, select: { email: true } });
  if (!user) throw new Error("Account not found.");
  return { name: user.email, orgId: null };
}

export async function saveSignupAction(formData: FormData): Promise<void> {
  const owner = await authorizeOwner(formData);
  const input = parse(SaveSignupSchema, formData);
  const { name, orgId } = await signupName(input.entityType, input.entityId);
  const followUpOn = input.status === "follow_up" ? input.followUpOn : null;
  await saveSignupReview(
    input.entityType,
    input.entityId,
    { status: input.status, note: input.note || null, followUpOn },
    owner.id,
  );
  audit({
    orgId,
    userId: owner.id,
    userDisplay: owner.displayName,
    entityType: input.entityType,
    entityId: input.entityId,
    action: "signup.review",
    summary: `${name}: ${input.status}${followUpOn ? ` by ${day(followUpOn)}` : ""}`,
  });
  signupsPage(formData, `Saved ${name}.`);
}

/** The old "Done" button: marks the sign-up done. */
export async function markFollowedUpAction(formData: FormData): Promise<void> {
  const owner = await authorizeOwner(formData);
  const input = parse(SignupRefSchema, formData);
  const { name, orgId } = await signupName(input.entityType, input.entityId);
  await saveSignupReview(input.entityType, input.entityId, { status: "done", followUpOn: null }, owner.id);
  audit({
    orgId,
    userId: owner.id,
    userDisplay: owner.displayName,
    entityType: input.entityType,
    entityId: input.entityId,
    action: "signup.review",
    summary: `${name}: done`,
  });
  signupsPage(formData, "Taken off the queue.");
}

export async function approveSignupAction(formData: FormData): Promise<void> {
  const owner = await authorizeOwner(formData);
  const input = parse(SignupRefSchema, formData);
  const { name, orgId } = await signupName(input.entityType, input.entityId);
  const prior = await prisma.signupReview.findUnique({
    where: { entityType_entityId: { entityType: input.entityType, entityId: input.entityId } },
  });
  // Approving a declined sign-up turns it back on.
  let restored = false;
  if (prior?.status === "declined") {
    if (input.entityType === "Org") {
      await prisma.org.update({ where: { id: input.entityId }, data: { suspendedAt: null, suspendedReason: null } });
    } else {
      await enableAccount(input.entityId);
    }
    restored = true;
  }
  await saveSignupReview(input.entityType, input.entityId, { status: "approved", followUpOn: null }, owner.id);
  audit({
    orgId,
    userId: owner.id,
    userDisplay: owner.displayName,
    entityType: input.entityType,
    entityId: input.entityId,
    action: "signup.approve",
    summary: `${name}${restored ? " (turned back on)" : ""}`,
  });
  signupsPage(formData, restored ? `Approved ${name} and turned it back on.` : `Approved ${name}.`);
}

const DeclineSchema = SignupRefSchema.extend({
  reason: z.string().trim().min(1, "Say why.").max(500),
});

export async function declineSignupAction(formData: FormData): Promise<void> {
  const owner = await authorizeOwner(formData);
  const input = parse(DeclineSchema, formData);
  const { name, orgId } = await signupName(input.entityType, input.entityId);
  if (input.entityType === "Org") {
    await prisma.org.update({
      where: { id: input.entityId },
      data: { suspendedAt: new Date(), suspendedReason: `Sign-up declined: ${input.reason}` },
    });
  } else {
    if (input.entityId === owner.id) throw new Error("You can't turn off your own account.");
    await disableAccount(input.entityId, `Sign-up declined: ${input.reason}`);
  }
  await saveSignupReview(
    input.entityType,
    input.entityId,
    { status: "declined", note: input.reason, followUpOn: null },
    owner.id,
  );
  audit({
    orgId,
    userId: owner.id,
    userDisplay: owner.displayName,
    entityType: input.entityType,
    entityId: input.entityId,
    action: "signup.decline",
    summary: `${name}: ${input.reason}`,
  });
  signupsPage(formData, input.entityType === "Org" ? `Declined ${name}; the unit is suspended.` : `Declined ${name}; the account is off.`);
}

/** Trial to free access, from the queue. */
export async function compSignupAction(formData: FormData): Promise<void> {
  const owner = await authorizeOwner(formData);
  const input = parse(CompSchema, formData);
  if (input.until.getTime() <= Date.now()) throw new Error("Pick a date after today.");
  const org = await orgOrThrow(input.orgId);
  await prisma.org.update({
    where: { id: org.id },
    data: { compedUntil: input.until, compedNote: input.note || "Free access from sign-ups" },
  });
  const prior = await prisma.signupReview.findUnique({
    where: { entityType_entityId: { entityType: "Org", entityId: org.id } },
  });
  if (!prior || prior.status === "new") await saveSignupReview("Org", org.id, { status: "approved" }, owner.id);
  audit({
    orgId: org.id,
    userId: owner.id,
    userDisplay: owner.displayName,
    entityType: "Org",
    entityId: org.id,
    action: "org.comp",
    summary: `Free access until ${day(input.until)}${input.note ? `: ${input.note}` : ""} (from sign-ups)`,
  });
  signupsPage(formData, `${org.displayName} is free until ${day(input.until)}.`);
}

/** Trial to paying: emails the unit's owner a link to its billing page. Charges nothing. */
export async function askToPayAction(formData: FormData): Promise<void> {
  const owner = await authorizeOwner(formData);
  const input = parse(OrgIdSchema, formData);
  const org = await prisma.org.findUnique({
    where: { id: input.orgId },
    include: { owner: { select: { email: true, displayName: true } } },
  });
  if (!org) throw new Error("Unit not found.");
  if (org.stripeSubscriptionId) signupsPage(formData, `${org.displayName} already pays.`);
  const email = org.owner?.email ?? org.scoutmasterEmail;
  if (!email) throw new Error("This unit has no email to write to.");
  const sent = await sendPlanReminder({
    email,
    name: org.owner?.displayName ?? org.scoutmasterName ?? null,
    org,
    trialEndsAt: org.trialEndsAt,
  });
  if (!sent.ok) throw new Error(`The email didn't send: ${sent.error}`);
  const followUpOn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await saveSignupReview("Org", org.id, { status: "follow_up", followUpOn }, owner.id);
  audit({
    orgId: org.id,
    userId: owner.id,
    userDisplay: owner.displayName,
    entityType: "Org",
    entityId: org.id,
    action: "signup.ask_to_pay",
    summary: `Emailed ${email} a link to pick a plan`,
  });
  signupsPage(formData, `Asked ${email} to pick a plan; follow up by ${day(followUpOn)}.`);
}

/** Resends the confirm-your-email message to a new account (or a unit's owner). */
export async function resendConfirmationAction(formData: FormData): Promise<void> {
  const owner = await authorizeOwner(formData);
  const input = parse(UserIdSchema, formData);
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, emailVerified: true },
  });
  if (!user) throw new Error("Account not found.");
  if (user.emailVerified) signupsPage(formData, `${user.email} is already confirmed.`);
  // No session headers: Better Auth then sends to this address rather
  // than checking it against the signed-in owner's own email.
  await auth.api.sendVerificationEmail({ body: { email: user.email, callbackURL: "/account/profile?verified=1" } });
  audit({
    userId: owner.id,
    userDisplay: owner.displayName,
    entityType: "User",
    entityId: user.id,
    action: "signup.resend_confirmation",
    summary: user.email,
  });
  signupsPage(formData, `Sent ${user.email} a new confirmation link.`);
}

const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter an email address.").max(254),
  name: z.string().trim().max(120).optional().default(""),
  product: z.enum(["compass", "waypoint", "lantern"]),
  note: z.string().trim().max(1000).optional().default(""),
});

export async function inviteAction(formData: FormData): Promise<void> {
  const owner = await authorizeOwner(formData);
  const input = parse(InviteSchema, formData);
  const existing = await prisma.user.findFirst({
    where: { email: { equals: input.email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) signupsPage(formData, `${input.email} already has an account.`);
  const sent = await sendInvite({
    email: input.email,
    name: input.name || null,
    product: input.product,
    note: input.note || null,
  });
  if (!sent.ok) throw new Error(`The invite didn't send: ${sent.error}`);
  const invite = await prisma.ownerInvite.create({
    data: {
      email: input.email,
      name: input.name || null,
      product: input.product,
      note: input.note || null,
      createdById: owner.id,
    },
  });
  audit({
    userId: owner.id,
    userDisplay: owner.displayName,
    entityType: "OwnerInvite",
    entityId: invite.id,
    action: "signup.invite",
    summary: `${input.email} to ${input.product}`,
  });
  signupsPage(formData, `Invited ${input.email}.`);
}

const InviteIdSchema = z.object({ inviteId: z.string().min(1) });

export async function resendInviteAction(formData: FormData): Promise<void> {
  const owner = await authorizeOwner(formData);
  const input = parse(InviteIdSchema, formData);
  const invite = await prisma.ownerInvite.findUnique({ where: { id: input.inviteId } });
  if (!invite) throw new Error("Invite not found.");
  if (Date.now() - invite.lastSentAt.getTime() < 60_000) {
    signupsPage(formData, `Sent to ${invite.email} under a minute ago.`);
  }
  const product = (["compass", "waypoint", "lantern"] as const).find((p) => p === invite.product) ?? "compass";
  const sent = await sendInvite({ email: invite.email, name: invite.name, product, note: invite.note });
  if (!sent.ok) throw new Error(`The invite didn't send: ${sent.error}`);
  await prisma.ownerInvite.update({
    where: { id: invite.id },
    data: { sendCount: { increment: 1 }, lastSentAt: new Date() },
  });
  audit({
    userId: owner.id,
    userDisplay: owner.displayName,
    entityType: "OwnerInvite",
    entityId: invite.id,
    action: "signup.invite_resend",
    summary: invite.email,
  });
  signupsPage(formData, `Sent the invite to ${invite.email} again.`);
}
