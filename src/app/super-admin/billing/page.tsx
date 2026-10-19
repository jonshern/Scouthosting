// /super-admin/billing — the billing report: who pays and how, monthly
// recurring revenue, money collected by month, trial conversion,
// cancellations and failed payments. Read from what the Stripe webhook
// stored; this page never calls Stripe.

import Link from "next/link";
import { listUnits } from "@/lib/owner/console";
import {
  billingEvents,
  defaultMode,
  paymentReport,
  subscriptionMix,
  usd,
  type Mode,
} from "@/lib/owner/billing-report";
import { Pill, Section, Stat, shortDate } from "@/components/owner/ConsoleBits";
import { requireOwnerPage } from "@/lib/owner/guard";

export const metadata = { title: "Billing" };

export const dynamic = "force-dynamic";

export default async function OwnerBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  await requireOwnerPage();
  const sp = await searchParams;
  const mode: Mode = sp.mode === "live" || sp.mode === "test" ? sp.mode : await defaultMode();
  const [units, payments, events] = await Promise.all([listUnits(), paymentReport(mode), billingEvents()]);
  const mix = subscriptionMix(units);
  const maxMonth = Math.max(1, ...payments.months.map((m) => m.cents));
  const conv = events.trialConversion;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.03em]">Billing</h2>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-ink-muted">Payments from Stripe</span>
          <Link href="/super-admin/billing?mode=live" className={mode === "live" ? "rounded-full bg-ink px-3 py-1 font-medium text-white no-underline hover:text-white" : "rounded-full border border-line bg-surface px-3 py-1 text-ink-2 no-underline hover:border-control hover:text-ink"}>
            live
          </Link>
          <Link href="/super-admin/billing?mode=test" className={mode === "test" ? "rounded-full bg-ink px-3 py-1 font-medium text-white no-underline hover:text-white" : "rounded-full border border-line bg-surface px-3 py-1 text-ink-2 no-underline hover:border-control hover:text-ink"}>
            test mode
          </Link>
          <a href={`/super-admin/billing/payments.csv?mode=${mode}`}>Download CSV</a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Monthly recurring" value={usd(mix.mrrCents)} hint={`${usd(mix.mrrCents * 12)} a year`} />
        <Stat
          label="Paying units"
          value={mix.paying}
          hint={`${mix.yearly} yearly · ${mix.monthly} monthly${mix.otherPrice ? ` · ${mix.otherPrice} other price` : ""}`}
          href="/super-admin/orgs?kind=paid"
        />
        <Stat
          label="On trial"
          value={mix.trialing}
          hint={`${mix.trialingWithCard} with a card on file`}
          href="/super-admin/orgs?kind=trial"
        />
        <Stat
          label="Trial conversion, 90 days"
          value={conv.ended ? `${Math.round((conv.converted / conv.ended) * 100)}%` : "—"}
          hint={`${conv.converted} of ${conv.ended} trials that ended subscribed`}
        />
        <Stat
          label="Past due"
          value={mix.pastDue}
          tone={mix.pastDue ? "bad" : undefined}
          href="/super-admin/orgs?kind=past_due"
        />
        <Stat label="Canceling" value={mix.canceling} tone={mix.canceling ? "warn" : undefined} href="/super-admin/orgs?kind=canceling" />
        <Stat label="Canceled" value={mix.canceled} hint={`${events.cancellations.length} in the last 90 days`} href="/super-admin/orgs?kind=canceled" />
        <Stat label="Free access" value={mix.comped} href="/super-admin/orgs?kind=comped" />
      </div>

      <Section title={`Collected${mode === "test" ? " (Stripe test mode)" : ""}`}>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Last 30 days" value={usd(payments.last30.cents)} hint={`${payments.last30.payments} payments`} />
          <Stat label="This year" value={usd(payments.yearToDate.cents)} hint={`${payments.yearToDate.payments} payments`} />
          <Stat label="All time" value={usd(payments.allTime.cents)} hint={`${payments.allTime.payments} payments`} />
        </div>
        <table className="w-full text-sm" aria-label="Collected by month">
          <tbody>
            {payments.months.map((m) => (
              <tr key={m.month}>
                <td className="w-20 py-0.5 font-mono text-xs text-ink-muted">{m.month}</td>
                <td className="py-0.5">
                  <div
                    className="h-3 rounded-sm bg-accent"
                    style={{ width: `${(m.cents / maxMonth) * 100}%`, minWidth: m.cents ? 2 : 0 }}
                  />
                </td>
                <td className="w-28 py-0.5 text-right">{usd(m.cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-ink-muted">Refunds are made and shown in Stripe; these totals don&apos;t subtract them.</p>
      </Section>

      <Section title="Recent payments">
        {payments.recent.length === 0 ? (
          <p className="text-sm text-ink-muted">No payments recorded yet.</p>
        ) : (
          <ul className="divide-y divide-divider rounded-xl border border-line bg-surface text-sm">
            {payments.recent.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span>
                  {p.org ? <Link href={`/super-admin/orgs/${p.org.slug}`}>{p.org.displayName}</Link> : "Deleted unit"}
                  <span className="ml-2 font-mono text-xs text-ink-muted">{p.stripeInvoiceId}</span>
                </span>
                <span>
                  {usd(p.amountCents)} <span className="text-xs text-ink-muted">{shortDate(p.paidAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid gap-8 md:grid-cols-2">
        <Section title="Failed payments, 90 days">
          {events.failures.length === 0 ? (
            <p className="text-sm text-ink-muted">None.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {events.failures.map((e) => (
                <li key={e.id}>
                  {e.org ? <Link href={`/super-admin/orgs/${e.org.slug}`}>{e.org.displayName}</Link> : "Deleted unit"}{" "}
                  <span className="text-ink-muted">· {shortDate(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Cancellations, 90 days">
          {events.cancellations.length === 0 ? (
            <p className="text-sm text-ink-muted">None.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {events.cancellations.map((e) => (
                <li key={e.id}>
                  {e.org ? <Link href={`/super-admin/orgs/${e.org.slug}`}>{e.org.displayName}</Link> : "Deleted unit"}{" "}
                  <span className="text-ink-muted">· {shortDate(e.createdAt)}</span> <Pill tone="muted">ended</Pill>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
