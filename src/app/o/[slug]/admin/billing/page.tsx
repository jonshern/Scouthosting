// /o/[slug]/admin/billing — the unit's subscription: trial countdown,
// subscribe (Stripe Checkout, keeping the rest of the trial free), and
// the Stripe customer portal for card changes, invoices and canceling.
// Webhooks (api/webhooks/stripe) write the state this page reads.

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { canManageBilling } from "@/lib/billing/access";
import { availableIntervals, isConfigured } from "@/lib/billing/stripe";
import { PRICES, YEARLY_SAVINGS_USD, intervalForPriceId } from "@/lib/billing/pricing";
import { billingSummary } from "@/lib/billing/trial";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { ManageBillingButton, SubscribeButton } from "@/components/admin/BillingForms";

export const dynamic = "force-dynamic";

function day(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { slug } = await params;
  const { checkout } = await searchParams;
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/billing`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  if (!(await canManageBilling(user, org))) {
    return (
      <section>
        <AdminPageHeader kicker="Settings" title="Billing" />
        <p className="text-slate-soft">Only the unit&apos;s admins can see billing. Ask your unit&apos;s admin.</p>
      </section>
    );
  }

  const configured = isConfigured();
  const s = billingSummary(org, { stripeConfigured: configured });
  const intervals = availableIntervals();
  const currentPlan = intervalForPriceId(org.stripePriceId);
  const csrf = <CsrfTokenInput />;

  let headline: string;
  let body: string;
  if (org.isDemo) {
    headline = "Demo unit";
    body = "Demo units have every feature and are never billed.";
  } else if (s.status === "trialing") {
    headline = `${s.trialDaysLeft} day${s.trialDaysLeft === 1 ? "" : "s"} left in your free trial`;
    body = `Your trial ends ${day(s.trialEndsAt)}. Choose yearly or monthly any time; your card isn't charged until the trial ends.`;
  } else if (s.status === "active" && s.subscribed) {
    headline = s.cancelAtPeriodEnd
      ? "Subscription ending"
      : currentPlan
        ? `Subscribed: ${PRICES[currentPlan].long}`
        : "Subscribed";
    body = s.cancelAtPeriodEnd
      ? `Your subscription stops on ${day(s.currentPeriodEnd)}. Turn renewal back on from Manage billing.`
      : s.currentPeriodEnd
        ? `Renews automatically on ${day(s.currentPeriodEnd)}.`
        : "Renews automatically.";
  } else if (s.status === "active") {
    headline = "Active";
    body = "This unit predates self-serve billing and has nothing to pay right now.";
  } else if (s.status === "past_due") {
    headline = "Payment didn't go through";
    body = "Update your card in Manage billing. Stripe retries automatically for a few days.";
  } else if (s.status === "canceled") {
    headline = "Subscription canceled";
    body = "Your data is still here. Subscribe again to reopen the admin pages.";
  } else if (s.status === "suspended") {
    headline = "Suspended";
    body = "This unit is on hold. Contact support.";
  } else {
    headline = "Your free trial has ended";
    body = "Your data is still here and your public site is still up. Subscribe to keep editing.";
  }

  const canSubscribe = !org.isDemo && (!s.subscribed || s.status === "canceled");

  return (
    <section className="max-w-2xl">
      <AdminPageHeader kicker="Settings" title="Billing" description="Your unit's Compass subscription." />

      {checkout === "success" && (
        <p role="status" className="mb-6 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Thanks! Your card is saved. It can take a few seconds for the status below to update.
        </p>
      )}
      {checkout === "cancel" && (
        <p role="status" className="mb-6 rounded-md border border-line bg-bg p-3 text-sm text-slate-soft">
          Checkout canceled. Nothing was charged.
        </p>
      )}

      <div className="card space-y-4" data-testid="billing-status">
        <div>
          <h2 className="font-display text-2xl">{headline}</h2>
          <p className="mt-1 text-sm text-slate-soft">{body}</p>
          {canSubscribe && (
            <p className="mt-2 text-sm text-ink">
              {PRICES.year.long} or {PRICES.month.long} per unit, covering Compass, Waypoint and
              Lantern. Yearly saves ${YEARLY_SAVINGS_USD}. Cancel any time.
            </p>
          )}
        </div>
        {!configured && !org.isDemo ? (
          <p className="text-sm text-slate-muted">
            Billing isn&apos;t switched on for this server yet, so there&apos;s nothing to pay.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {canSubscribe &&
              intervals.map((interval) => (
                <SubscribeButton
                  key={interval}
                  csrf={csrf}
                  slug={slug}
                  interval={interval}
                  primary={interval === "year"}
                  label={`${interval === "year" ? "Pay yearly" : "Pay monthly"}: ${PRICES[interval].long}`}
                />
              ))}
            {org.stripeCustomerId && <ManageBillingButton csrf={csrf} slug={slug} />}
          </div>
        )}
      </div>
    </section>
  );
}
