// Equipment loan ledger. Three sections:
//   1. Add new equipment.
//   2. Active loans (overdue first).
//   3. Items + per-item loan-out form, grouped by category.
//
// Loan history lives at /admin/equipment/loans for full audit trail.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import {
  EquipmentItemForm,
  LoanForm,
  ReturnForm,
} from "@/components/admin/EquipmentForms";
import { Pill, Stat, StatRow } from "@/components/ui";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata = { title: "Equipment" };

export default async function EquipmentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  const [items, activeLoans, allMembers] = await Promise.all([
    prisma.equipment.findMany({
      where: { orgId: org.id },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.equipmentLoan.findMany({
      where: { orgId: org.id, returnedAt: null },
      orderBy: { loanedAt: "asc" },
      include: { equipment: true, member: true },
    }),
    prisma.member.findMany({
      where: { orgId: org.id, deletedAt: null, status: { in: ["active", "prospect"] } },
    }),
  ]);

  let memberLabels = new Map<string, string>();
  let activeLoanRows: {
    id: string;
    equipmentName: string;
    memberId: string;
    memberName: string;
    loanedAt: Date;
    dueAt: Date | null;
    overdue: boolean;
    notes: string | null;
  }[] = [];

  if (org.encryptedDek) {
    const dek = unwrapDekWithMaster(org);
    memberLabels = new Map(
      allMembers.map((m) => {
        const pii = decryptMemberPii(m, dek, org.id);
        return [m.id, `${pii.firstName} ${pii.lastName}`.trim()];
      }),
    );
    const now = new Date();
    activeLoanRows = activeLoans.map((l) => {
      const pii = decryptMemberPii(l.member, dek, org.id);
      return {
        id: l.id,
        equipmentName: l.equipment.name,
        memberId: l.memberId,
        memberName: `${pii.firstName} ${pii.lastName}`.trim(),
        loanedAt: l.loanedAt,
        dueAt: l.dueAt,
        overdue: !!(l.dueAt && l.dueAt < now),
        notes: l.loanNotes,
      };
    });
    activeLoanRows.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return a.loanedAt.getTime() - b.loanedAt.getTime();
    });
  }

  // Index of loaned-out item ids so the per-item card knows whether to
  // gray out the loan-out form (we still let leaders create overlapping
  // loans because quantity > 1 is common).
  const onLoanByItem = new Map<string, number>();
  for (const l of activeLoans) {
    onLoanByItem.set(l.equipmentId, (onLoanByItem.get(l.equipmentId) ?? 0) + 1);
  }

  // Group items by category.
  const grouped = new Map<string, typeof items>();
  for (const i of items) {
    const key = i.category ?? "Uncategorized";
    const list = grouped.get(key) ?? [];
    list.push(i);
    grouped.set(key, list);
  }
  const categories = [...grouped.keys()].sort();

  const memberOptions = [...memberLabels.entries()]
    .map(([id, name]) => ({ id, name: name || id }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="space-y-10">
      <AdminPageHeader
        kicker="Equipment"
        title="Loan ledger"
        description="Patrol boxes, stoves, gear — track what's out, who has it, and when it's due back."
        actions={
          <Link href={`/o/${slug}/admin/equipment/loans`} className="btn-secondary">
            Full loan history →
          </Link>
        }
      />

      <StatRow>
        <Stat label="Items on file" value={items.length} />
        <Stat label="On loan" value={activeLoans.length} tone="accent" />
        <Stat
          label="Overdue"
          value={activeLoanRows.filter((r) => r.overdue).length}
          tone={activeLoanRows.some((r) => r.overdue) ? "danger" : "default"}
        />
        <Stat
          label="Available items"
          value={items.length - new Set([...onLoanByItem.keys()]).size}
        />
      </StatRow>

      <div>
        <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink mb-3">
          Active loans
        </h2>
        {activeLoanRows.length === 0 ? (
          <p className="text-sm text-slate-muted">Nothing on loan right now.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-left font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Item</th>
                  <th className="px-4 py-2 font-semibold">Borrower</th>
                  <th className="px-4 py-2 font-semibold">Loaned</th>
                  <th className="px-4 py-2 font-semibold">Due</th>
                  <th className="px-4 py-2 font-semibold">Notes</th>
                  <th className="px-4 py-2 font-semibold">Return</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {activeLoanRows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium text-ink">{r.equipmentName}</td>
                    <td className="px-4 py-3 text-slate-soft">{r.memberName}</td>
                    <td className="px-4 py-3 text-slate-soft">
                      {r.loanedAt.toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {r.dueAt ? (
                        <span className="flex items-center gap-2">
                          {r.dueAt.toLocaleDateString()}
                          {r.overdue ? <Pill tone="danger">Overdue</Pill> : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-soft">{r.notes ?? ""}</td>
                    <td className="px-4 py-3">
                      <ReturnForm orgSlug={slug} loanId={r.id} csrf={<CsrfTokenInput />} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink mb-3">
          Inventory
        </h2>
        {categories.length === 0 ? (
          <p className="text-sm text-slate-muted">
            No equipment yet — add an item below to start tracking.
          </p>
        ) : (
          <div className="space-y-6">
            {categories.map((cat) => (
              <section key={cat}>
                <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted mb-2">
                  {cat}
                </h3>
                <ul className="space-y-3">
                  {grouped.get(cat)!.map((i) => (
                    <li key={i.id} className="rounded-xl border border-line bg-surface p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <div className="font-medium text-ink">{i.name}</div>
                          <div className="text-xs text-slate-muted">
                            {i.serialOrTag ? `#${i.serialOrTag} · ` : ""}
                            {i.location ?? "no location"} · qty {i.quantity}
                            {i.condition !== "good" ? ` · ${i.condition}` : ""}
                          </div>
                        </div>
                        {onLoanByItem.has(i.id) ? (
                          <Pill tone="amber">
                            {onLoanByItem.get(i.id)} on loan
                          </Pill>
                        ) : (
                          <Pill tone="success">Available</Pill>
                        )}
                      </div>
                      <div className="mt-3">
                        <LoanForm
                          orgSlug={slug}
                          equipmentId={i.id}
                          members={memberOptions}
                          csrf={<CsrfTokenInput />}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink mb-3">
          Add equipment
        </h2>
        <EquipmentItemForm orgSlug={slug} csrf={<CsrfTokenInput />} />
      </div>
    </section>
  );
}
