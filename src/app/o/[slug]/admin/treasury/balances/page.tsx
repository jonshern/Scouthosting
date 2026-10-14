// Treasurer's balance-blast page. Lists every member with a non-zero
// balance and surfaces a one-click "send all of them an email"
// button.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { SendBalancesForm } from "@/components/admin/SendBalancesForm";
import { accountBalancesReport } from "@/lib/treasury/reports";
import { formatBalance } from "@/lib/treasury/money";
import { Pill } from "@/components/ui";
import { requireTreasuryPage } from "@/lib/admin/guard";

export default async function TreasuryBalancesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireTreasuryPage(slug);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const rows = await accountBalancesReport(org, { onlyNonZero: true });

  return (
    <section className="space-y-8">
      <AdminPageHeader
        kicker="Treasury · Balances"
        title="Send balance updates"
        description="Email every family with a non-zero balance, with their last 5 transactions and a deep link to the parent portal."
        actions={
          <Link href={`/o/${slug}/admin/treasury`} className="btn-secondary">← Overview</Link>
        }
      />
      <div className="card space-y-3 max-w-md">
        <p className="text-sm text-slate-soft">
          {rows.length === 0
            ? "Everyone is at zero. Nothing to send."
            : `${rows.length} member${rows.length === 1 ? "" : "s"} have a non-zero balance.`}
        </p>
        {rows.length > 0 ? <SendBalancesForm orgSlug={slug} csrf={<CsrfTokenInput />} /> : null}
      </div>
      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt text-left text-[11px] uppercase tracking-[0.08em] text-slate-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Member</th>
                <th className="px-4 py-2 font-semibold">Patrol</th>
                <th className="px-4 py-2 font-semibold text-right">Balance</th>
                <th className="px-4 py-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.memberId}>
                  <td className="px-4 py-3 font-medium text-ink">
                    <Link
                      href={`/o/${slug}/admin/treasury/members/${r.memberId}`}
                      className="hover:text-sky"
                    >
                      {r.scoutName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-soft">{r.patrol ?? "—"}</td>
                  <td
                    className={`px-4 py-3 text-right font-mono ${
                      r.balanceCents < 0 ? "text-danger" : "text-success"
                    }`}
                  >
                    {formatBalance(r.balanceCents)}
                  </td>
                  <td className="px-4 py-3">
                    {r.balanceCents < 0 ? (
                      <Pill tone="danger">Owes</Pill>
                    ) : (
                      <Pill tone="success">Credit</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
