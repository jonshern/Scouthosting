// Treasury overview. Shows fund balances, member subaccount totals,
// and the recompute / provisioning controls. Sub-pages handle the
// ledger and posting flows.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import {
  ProvisionButton,
  RecomputeButton,
} from "@/components/admin/TreasuryForms";
import { Pill, Stat, StatRow } from "@/components/ui";
import { centsToDollars, formatBalance } from "@/lib/treasury/money";

export default async function TreasuryHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  const funds = await prisma.fund.findMany({
    where: { orgId: org.id, archived: false },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  if (funds.length === 0) {
    return (
      <section className="space-y-6">
        <AdminPageHeader
          kicker="Treasury"
          title="Set up treasury"
          description="One-time provision creates the General fund, Scout accounts fund, Stripe fees fund, and a subaccount per active member."
        />
        <div className="card max-w-md">
          <ProvisionButton orgSlug={slug} csrf={<CsrfTokenInput />} />
        </div>
      </section>
    );
  }

  const subaccounts = await prisma.memberSubaccount.findMany({
    where: { orgId: org.id },
    select: { balanceCents: true },
  });
  const positive = subaccounts.filter((s) => s.balanceCents > 0).reduce((a, s) => a + s.balanceCents, 0);
  const negative = subaccounts.filter((s) => s.balanceCents < 0).reduce((a, s) => a + s.balanceCents, 0);

  const recentCount = await prisma.transaction.count({ where: { orgId: org.id } });

  return (
    <section className="space-y-10">
      <AdminPageHeader
        kicker="Treasury"
        title="Overview"
        description="Funds, member balances, ledger health."
        actions={
          <>
            <Link href={`/o/${slug}/admin/treasury/ledger`} className="btn-secondary">Ledger</Link>
            <Link href={`/o/${slug}/admin/treasury/posting`} className="btn-secondary">Posting</Link>
            <Link href={`/o/${slug}/admin/treasury/reports`} className="btn-secondary">Reports</Link>
            <Link href={`/o/${slug}/admin/treasury/balances`} className="btn-secondary">Balance email</Link>
            <Link href={`/o/${slug}/admin/treasury/reconcile`} className="btn-secondary">Reconcile</Link>
            <Link href={`/o/${slug}/admin/treasury/settings`} className="btn-secondary">Settings</Link>
          </>
        }
      />

      <StatRow>
        <Stat label="Funds" value={funds.length} />
        <Stat label="Subaccounts" value={subaccounts.length} />
        <Stat
          label="Family credits"
          value={centsToDollars(positive)}
          tone="success"
        />
        <Stat
          label="Family balances owed"
          value={centsToDollars(Math.abs(negative))}
          tone={negative < 0 ? "danger" : "default"}
        />
      </StatRow>

      <div>
        <h2 className="font-display text-2xl tracking-[-0.015em] text-ink mb-3">Funds</h2>
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt text-left text-[11px] uppercase tracking-[0.08em] text-slate-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Fund</th>
                <th className="px-4 py-2 font-semibold">Code</th>
                <th className="px-4 py-2 font-semibold text-right">Balance</th>
                <th className="px-4 py-2 font-semibold">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {funds.map((f) => (
                <tr key={f.id}>
                  <td className="px-4 py-3 font-medium text-ink">{f.name}</td>
                  <td className="px-4 py-3 text-slate-soft font-mono text-xs">{f.code}</td>
                  <td className="px-4 py-3 text-right text-slate-soft">
                    {formatBalance(f.balanceCents)}
                  </td>
                  <td className="px-4 py-3">
                    {f.isSystem ? <Pill tone="accent">System</Pill> : <Pill tone="neutral">Custom</Pill>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="font-display text-2xl tracking-[-0.015em] text-ink mb-3">Health</h2>
        <p className="text-sm text-slate-muted mb-3">
          {recentCount} transaction{recentCount === 1 ? "" : "s"} on file. Cached
          balances are validated nightly; run a check on demand below.
        </p>
        <RecomputeButton orgSlug={slug} csrf={<CsrfTokenInput />} />
      </div>
    </section>
  );
}
