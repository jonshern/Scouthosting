// Treasury reports hub. Fund balances + account balances + budget vs
// actual + year-over-year. CSVs sit at sibling .csv routes.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  fundBalancesReport,
  accountBalancesReport,
  budgetVsActualReport,
  yearOverYearReport,
} from "@/lib/treasury/reports";
import { centsToDollars, formatBalance } from "@/lib/treasury/money";
import { Pill, PrintButton } from "@/components/ui";
import { requireTreasuryPage } from "@/lib/admin/guard";

export default async function TreasuryReports({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ fy?: string }>;
}) {
  const { slug } = await params;
  await requireTreasuryPage(slug);
  const sp = await searchParams;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  // Pick the active fiscal year. If none configured, fall back to the
  // current calendar year.
  const fys = await prisma.fiscalYear.findMany({
    where: { orgId: org.id },
    orderBy: { startsOn: "desc" },
  });
  const now = new Date();
  const activeFy = fys.find((fy) =>
    sp.fy ? fy.id === sp.fy : fy.startsOn <= now && fy.endsOn >= now,
  ) ?? fys[0];

  const fyStart = activeFy?.startsOn ?? new Date(now.getFullYear(), 0, 1);
  const fyEnd = activeFy?.endsOn ?? new Date(now.getFullYear(), 11, 31);

  const [funds, accounts, budgetActual, yoy] = await Promise.all([
    fundBalancesReport({ org, fyStart, fyEnd }),
    accountBalancesReport(org, { onlyNonZero: true }),
    activeFy ? budgetVsActualReport({ org, fiscalYearId: activeFy.id }) : Promise.resolve([]),
    yearOverYearReport({ org }),
  ]);

  return (
    <section className="space-y-12">
      <AdminPageHeader
        kicker="Treasury · Reports"
        title="Reports"
        description={
          activeFy
            ? `Active fiscal year: ${activeFy.label} (${activeFy.startsOn.toLocaleDateString()} – ${activeFy.endsOn.toLocaleDateString()})`
            : "No fiscal year configured. Showing the current calendar year."
        }
        actions={
          <>
            <Link href={`/o/${slug}/admin/treasury`} className="btn-secondary">← Overview</Link>
            <PrintButton>Print all</PrintButton>
          </>
        }
      />

      {fys.length > 0 ? (
        <form method="GET" className="flex items-center gap-2 text-sm">
          <label htmlFor="fy" className="text-slate-soft">Fiscal year</label>
          <select id="fy" name="fy" defaultValue={activeFy?.id ?? ""} className="field max-w-xs">
            {fys.map((fy) => (
              <option key={fy.id} value={fy.id}>
                {fy.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-secondary">Apply</button>
        </form>
      ) : null}

      <div>
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink">
            Fund balances
          </h2>
          <Link
            href={`/o/${slug}/admin/treasury/reports/funds.csv`}
            className="text-sm text-slate-soft hover:text-sky"
          >
            Download CSV →
          </Link>
        </header>
        <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt text-left font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">Fund</th>
                <th className="px-4 py-2 font-semibold text-right">Balance</th>
                <th className="px-4 py-2 font-semibold text-right">FYTD income</th>
                <th className="px-4 py-2 font-semibold text-right">FYTD expense</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {funds.map((f) => (
                <tr key={f.fundId}>
                  <td className="px-4 py-3 text-ink font-medium">{f.name}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-soft">
                    {centsToDollars(f.balanceCents)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-success">
                    {centsToDollars(f.fytdIncomeCents)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-danger">
                    {centsToDollars(f.fytdExpenseCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink">
            Account balances (non-zero only)
          </h2>
          <Link
            href={`/o/${slug}/admin/treasury/reports/accounts.csv`}
            className="text-sm text-slate-soft hover:text-sky"
          >
            Download CSV →
          </Link>
        </header>
        {accounts.length === 0 ? (
          <p className="mt-2 text-sm text-slate-muted">All members at zero.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-left font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Member</th>
                  <th className="px-4 py-2 font-semibold">Patrol</th>
                  <th className="px-4 py-2 font-semibold text-right">Balance</th>
                  <th className="px-4 py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {accounts.map((a) => (
                  <tr key={a.memberId}>
                    <td className="px-4 py-3 font-medium text-ink">
                      <Link
                        href={`/o/${slug}/admin/treasury/members/${a.memberId}`}
                        className="hover:text-sky"
                      >
                        {a.scoutName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-soft">{a.patrol ?? "—"}</td>
                    <td
                      className={`px-4 py-3 text-right font-mono ${
                        a.balanceCents < 0 ? "text-danger" : "text-success"
                      }`}
                    >
                      {formatBalance(a.balanceCents)}
                    </td>
                    <td className="px-4 py-3">
                      {a.balanceCents < 0 ? (
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
        )}
      </div>

      <div>
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink">
            Budget vs. actual
          </h2>
          {activeFy ? (
            <Link
              href={`/o/${slug}/admin/treasury/reports/budget.csv?fy=${activeFy.id}`}
              className="text-sm text-slate-soft hover:text-sky"
            >
              Download CSV →
            </Link>
          ) : null}
        </header>
        {!activeFy ? (
          <p className="mt-2 text-sm text-slate-muted">
            Configure a fiscal year and per-fund budgets in settings to see this report.
          </p>
        ) : budgetActual.length === 0 ? (
          <p className="mt-2 text-sm text-slate-muted">
            No budgets set for {activeFy.label}.
          </p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-left font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Fund</th>
                  <th className="px-4 py-2 font-semibold text-right">Expected</th>
                  <th className="px-4 py-2 font-semibold text-right">Actual</th>
                  <th className="px-4 py-2 font-semibold text-right">Δ</th>
                  <th className="px-4 py-2 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {budgetActual.map((r) => {
                  const delta = r.actualCents - r.expectedCents;
                  return (
                    <tr key={r.fundId}>
                      <td className="px-4 py-3 text-ink font-medium">{r.fundName}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-soft">
                        {centsToDollars(r.expectedCents)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-soft">
                        {centsToDollars(r.actualCents)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono ${
                          delta < 0 ? "text-danger" : "text-success"
                        }`}
                      >
                        {centsToDollars(delta)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-soft">
                        {r.notes ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink">
            Year over year
          </h2>
          <Link
            href={`/o/${slug}/admin/treasury/reports/yoy.csv`}
            className="text-sm text-slate-soft hover:text-sky"
          >
            Download CSV →
          </Link>
        </header>
        {yoy.length === 0 ? (
          <p className="mt-2 text-sm text-slate-muted">
            Configure fiscal years to enable this view.
          </p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-left font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Fiscal year</th>
                  <th className="px-4 py-2 font-semibold text-right">Income</th>
                  <th className="px-4 py-2 font-semibold text-right">Expense</th>
                  <th className="px-4 py-2 font-semibold text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {yoy.map((row) => (
                  <tr key={row.label}>
                    <td className="px-4 py-3 text-ink font-medium">{row.label}</td>
                    <td className="px-4 py-3 text-right font-mono text-success">
                      {centsToDollars(row.totalIncomeCents)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-danger">
                      {centsToDollars(row.totalExpenseCents)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono ${
                        row.netCents < 0 ? "text-danger" : "text-success"
                      }`}
                    >
                      {centsToDollars(row.netCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
