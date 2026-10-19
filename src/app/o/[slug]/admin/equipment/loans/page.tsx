// Full loan history — every loan, active or returned. Useful for
// settling who lost what and for the auditor's eye on equipment use.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { Pill } from "@/components/ui";
import { requireAdminPage } from "@/lib/admin/guard";

export default async function LoanHistoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  const loans = await prisma.equipmentLoan.findMany({
    where: { orgId: org.id },
    include: { equipment: true, member: true },
    orderBy: [{ returnedAt: "desc" }, { loanedAt: "desc" }],
    take: 500,
  });

  const dek = org.encryptedDek ? unwrapDekWithMaster(org) : null;

  return (
    <section className="space-y-8">
      <AdminPageHeader
        kicker="Equipment"
        title="Loan history"
        description="Most recent 500 loans across every item."
        actions={
          <Link href={`/o/${slug}/admin/equipment`} className="btn-secondary">
            ← Active loans
          </Link>
        }
      />
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-left font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            <tr>
              <th className="px-4 py-2 font-semibold">Item</th>
              <th className="px-4 py-2 font-semibold">Borrower</th>
              <th className="px-4 py-2 font-semibold">Out</th>
              <th className="px-4 py-2 font-semibold">Due</th>
              <th className="px-4 py-2 font-semibold">Returned</th>
              <th className="px-4 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loans.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-muted">
                  No loans yet.
                </td>
              </tr>
            ) : (
              loans.map((l) => {
                const memberName = dek
                  ? (() => {
                      const p = decryptMemberPii(l.member, dek, org.id);
                      return `${p.firstName} ${p.lastName}`.trim();
                    })()
                  : "(encrypted)";
                return (
                  <tr key={l.id}>
                    <td className="px-4 py-3 font-medium text-ink">{l.equipment.name}</td>
                    <td className="px-4 py-3 text-slate-soft">{memberName}</td>
                    <td className="px-4 py-3 text-slate-soft">
                      {l.loanedAt.toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-slate-soft">
                      {l.dueAt ? l.dueAt.toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-soft">
                      {l.returnedAt ? l.returnedAt.toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {l.returnedAt ? (
                        <Pill tone="success">Returned</Pill>
                      ) : l.dueAt && l.dueAt < new Date() ? (
                        <Pill tone="danger">Overdue</Pill>
                      ) : (
                        <Pill tone="amber">Out</Pill>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
