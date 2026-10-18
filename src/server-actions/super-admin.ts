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
