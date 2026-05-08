// Fiscal year detail — edit the year + manage per-fund budgets.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import {
  FiscalYearForm,
  BudgetForm,
} from "@/components/admin/FiscalYearForms";

export default async function FiscalYearDetail({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const fy = await prisma.fiscalYear.findUnique({
    where: { id, orgId: org.id },
    include: { budgets: true },
  });
  if (!fy) notFound();

  const funds = await prisma.fund.findMany({
    where: { orgId: org.id, archived: false },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  const existing = new Map(
    fy.budgets.map((b) => [b.fundId, { expectedCents: b.expectedCents, notes: b.notes }]),
  );

  return (
    <section className="space-y-8">
      <AdminPageHeader
        kicker="Treasury · Fiscal year"
        title={fy.label}
        description={`${fy.startsOn.toLocaleDateString()} – ${fy.endsOn.toLocaleDateString()}${
          fy.closedAt ? ` · closed ${fy.closedAt.toLocaleDateString()}` : ""
        }`}
        actions={
          <Link
            href={`/o/${slug}/admin/treasury/fiscal-years`}
            className="btn-secondary"
          >
            ← Fiscal years
          </Link>
        }
      />

      <FiscalYearForm
        orgSlug={slug}
        initial={{
          id: fy.id,
          label: fy.label,
          startsOn: fy.startsOn,
          endsOn: fy.endsOn,
          closed: !!fy.closedAt,
        }}
        csrf={<CsrfTokenInput />}
      />

      <div>
        <h2 className="font-display text-2xl tracking-[-0.015em] text-ink mb-3">
          Per-fund budgets
        </h2>
        <p className="text-sm text-slate-muted mb-3">
          Positive numbers = expected income, negative = expected expense.
          Reports compare against actual posted transactions in the
          fiscal-year window.
        </p>
        {funds.length === 0 ? (
          <p className="text-sm text-slate-muted">
            No funds defined yet —{" "}
            <Link href={`/o/${slug}/admin/treasury`} className="text-accent">
              provision Treasury
            </Link>{" "}
            first.
          </p>
        ) : (
          <BudgetForm
            orgSlug={slug}
            fiscalYearId={fy.id}
            funds={funds}
            existing={existing}
            csrf={<CsrfTokenInput />}
          />
        )}
      </div>
    </section>
  );
}
