"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { canManageBilling } from "@/lib/billing/access";
import { createBillingPortalSession, createCheckoutSession, isConfigured } from "@/lib/billing/stripe";
import { logger } from "@/lib/log";
import { orgPublicOrigin } from "@/lib/tenancy/resolve";
import { recordAction } from "@/lib/usage/collect";

const log = logger.child("billing-actions");

export type BillingActionState = { error?: string } | null;

const Schema = z.object({ orgSlug: z.string().min(1) });
const IntervalSchema = z.enum(["year", "month"]);

// Stripe sends the admin back to the unit's own address, never one
// taken from the request's Host header.
function billingUrl(org: { slug: string; customDomain: string | null }): string {
  return `${orgPublicOrigin(org)}/admin/billing`;
}

async function authorize(formData: FormData) {
  if (!(await verifyOrigin())) return { error: "Bad origin." } as const;
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF token." } as const;
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." } as const;
  const { user } = await getSession();
  if (!user) return { error: "Sign in first." } as const;
  const org = await prisma.org.findUnique({ where: { slug: parsed.data.orgSlug } });
  if (!org || !(await canManageBilling(user, org))) return { error: "Only the unit's admins can manage billing." } as const;
  return { user, org } as const;
}

export async function startSubscriptionAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const a = await authorize(formData);
  if ("error" in a) return { error: a.error };
  if (!isConfigured()) return { error: "Billing isn't set up on this server yet." };
  if (a.org.stripeSubscriptionId && a.org.subscriptionStatus !== "canceled") {
    return { error: "This unit already has a subscription. Use Manage billing." };
  }

  const interval = IntervalSchema.safeParse(formData.get("interval"));
  if (!interval.success) return { error: "Pick yearly or monthly." };

  const base = billingUrl(a.org);
  let url: string | null;
  try {
    ({ url } = await createCheckoutSession(a.org, a.user, {
      interval: interval.data,
      successUrl: `${base}?checkout=success`,
      cancelUrl: `${base}?checkout=cancel`,
    }));
  } catch (e) {
    log.warn("checkout session failed", { orgId: a.org.id, err: e instanceof Error ? e.message : String(e) });
    return { error: "Stripe couldn't start checkout. Try again in a minute." };
  }
  if (!url) return { error: "Stripe didn't return a checkout page." };
  recordAction("checkout_started", { product: "compass", userId: a.user.id, orgId: a.org.id, props: { interval: interval.data } });
  redirect(url);
}

export async function openBillingPortalAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  const a = await authorize(formData);
  if ("error" in a) return { error: a.error };
  if (!a.org.stripeCustomerId) return { error: "Add a card first." };

  let url: string;
  try {
    ({ url } = await createBillingPortalSession(a.org, {
      returnUrl: billingUrl(a.org),
    }));
  } catch (e) {
    log.warn("portal session failed", { orgId: a.org.id, err: e instanceof Error ? e.message : String(e) });
    return { error: "Stripe couldn't open billing. Try again in a minute." };
  }
  redirect(url);
}
