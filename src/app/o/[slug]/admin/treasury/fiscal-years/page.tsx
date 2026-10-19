// Fiscal years admin. Treasury reports already query FiscalYear /
// FundBudget rows when they exist; this page lets the leader create
// them without dropping into the seed script.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { FiscalYearForm } from "@/components/admin/FiscalYearForms";
import { Pill } from "@/components/ui";
import { requireTreasuryPage } from "@/lib/admin/guard";

export default async function FiscalYearsAdmin({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireTreasuryPage(slug);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const fys = await prisma.fiscalYear.findMany({
    where: { orgId: org.id },
    orderBy: { startsOn: "desc" },
  });
  const today = new Date();

  return (
    <section className="space-y-10">
      <AdminPageHeader
        kicker="Treasury · Fiscal years"
        title="Fiscal years"
        description="Define the fiscal calendar your unit budgets against. Reports under /admin/treasury/reports use the active fiscal year as their default window."
        actions={
          <Link href={`/o/${slug}/admin/treasury`} className="btn-secondary">
            ← Treasury
          </Link>
        }
      />

      <div>
        <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink mb-3">Defined years</h2>
        {fys.length === 0 ? (
          <p className="text-sm text-slate-muted">No fiscal years yet — add one below.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-left font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Label</th>
                  <th className="px-4 py-2 font-semibold">Window</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {fys.map((fy) => {
                  const active =
                    !fy.closedAt && fy.startsOn <= today && fy.endsOn >= today;
                  const closed = !!fy.closedAt;
                  return (
                    <tr key={fy.id}>
                      <td className="px-4 py-3 font-medium text-ink">
                        <Link
                          href={`/o/${slug}/admin/treasury/fiscal-years/${fy.id}`}
                          className="hover:text-accent"
                        >
                          {fy.label}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-soft">
                        {fy.startsOn.toLocaleDateString()} –{" "}
                        {fy.endsOn.toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        {closed ? (
                          <Pill tone="neutral">Closed</Pill>
                        ) : active ? (
                          <Pill tone="success">Active</Pill>
                        ) : fy.startsOn > today ? (
                          <Pill tone="amber">Future</Pill>
                        ) : (
                          <Pill tone="neutral">Past</Pill>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/o/${slug}/admin/treasury/fiscal-years/${fy.id}`}
                          className="text-xs text-accent hover:text-ink"
                        >
                          Budgets →
                        </Link>
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
        <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink mb-3">
          Add a fiscal year
        </h2>
        <FiscalYearForm orgSlug={slug} csrf={<CsrfTokenInput />} />
      </div>
    </section>
  );
}
