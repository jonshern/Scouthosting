// Bank reconciliation: upload a CSV, match unmatched rows against
// existing Transactions inside a 7-day window with the same amount.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import {
  BankUploadForm,
  MatchRowForm,
} from "@/components/admin/BankImportForms";
import { Pill } from "@/components/ui";
import { centsToDollars } from "@/lib/treasury/money";
import { requireTreasuryPage } from "@/lib/admin/guard";

export default async function TreasuryReconcilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireTreasuryPage(slug);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  const imports = await prisma.bankImport.findMany({
    where: { orgId: org.id },
    orderBy: { uploadedAt: "desc" },
    take: 5,
  });

  const recentImportIds = imports.map((i) => i.id);
  const rows = await prisma.bankImportRow.findMany({
    where: { importId: { in: recentImportIds } },
    orderBy: [{ matchedAt: "asc" }, { postedAt: "desc" }],
    take: 200,
  });

  // Pre-fetch candidate transactions for the unmatched rows: same
  // amount within ±7 days, no bankImportRowId yet.
  const unmatchedRows = rows.filter((r) => !r.matchedAt);
  const candidatesByRow = new Map<string, { id: string; label: string }[]>();
  for (const r of unmatchedRows) {
    const lo = new Date(r.postedAt.getTime() - 7 * 86400_000);
    const hi = new Date(r.postedAt.getTime() + 7 * 86400_000);
    const candidates = await prisma.transaction.findMany({
      where: {
        orgId: org.id,
        amountCents: r.amountCents,
        bankImportRowId: null,
        postedAt: { gte: lo, lte: hi },
      },
      orderBy: { postedAt: "desc" },
      take: 10,
      include: { fund: { select: { name: true } } },
    });
    candidatesByRow.set(
      r.id,
      candidates.map((c) => ({
        id: c.id,
        label: `${c.postedAt.toLocaleDateString()} · ${c.fund.name} · ${c.description.slice(0, 50)}`,
      })),
    );
  }

  return (
    <section className="space-y-10">
      <AdminPageHeader
        kicker="Treasury · Reconcile"
        title="Bank reconciliation"
        description="Upload a CSV of bank activity and match each row to an existing transaction. Matched rows store a back-link on the transaction so an auditor can prove the books match the bank."
        actions={
          <Link href={`/o/${slug}/admin/treasury`} className="btn-secondary">← Overview</Link>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="font-display text-lg text-ink mb-3">Upload</h2>
          <BankUploadForm orgSlug={slug} csrf={<CsrfTokenInput />} />
        </div>
        <div className="text-sm text-slate-soft">
          <h3 className="font-display text-lg text-ink mb-2">Headers we recognize</h3>
          <p>Any column containing one of these keywords:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
            <li>Date / Posted / Transaction Date</li>
            <li>Amount / Amt / Value (or Debit + Credit)</li>
            <li>Description / Memo / Details / Payee</li>
          </ul>
          <p className="mt-3">
            Two-column debit/credit layouts (Chase, BoA) are handled
            automatically.
          </p>
        </div>
      </div>

      <div>
        <h2 className="font-display text-lg text-ink mb-3">Recent uploads</h2>
        {imports.length === 0 ? (
          <p className="text-sm text-slate-muted">No imports yet.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {imports.map((i) => (
              <li key={i.id} className="text-slate-soft">
                <span className="font-mono text-xs text-slate-muted">{i.id.slice(0, 8)}</span>{" "}
                · {i.filename} · {i.format} · {i.uploadedAt.toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="font-display text-lg text-ink mb-3">Rows</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-muted">Nothing to reconcile.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-left text-[11px] uppercase tracking-[0.08em] text-slate-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Posted</th>
                  <th className="px-4 py-2 font-semibold text-right">Amount</th>
                  <th className="px-4 py-2 font-semibold">Description</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 text-slate-soft">
                      {r.postedAt.toLocaleDateString()}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono ${
                        r.amountCents < 0 ? "text-danger" : "text-success"
                      }`}
                    >
                      {centsToDollars(r.amountCents)}
                    </td>
                    <td className="px-4 py-3 text-slate-soft">{r.description}</td>
                    <td className="px-4 py-3">
                      {r.matchedAt ? (
                        <Pill tone="success">Matched</Pill>
                      ) : (
                        <Pill tone="danger">Unmatched</Pill>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.matchedAt ? (
                        <span className="text-xs text-slate-muted">
                          {r.matchedAt.toLocaleDateString()}
                        </span>
                      ) : (
                        <MatchRowForm
                          orgSlug={slug}
                          rowId={r.id}
                          candidates={candidatesByRow.get(r.id) ?? []}
                          csrf={<CsrfTokenInput />}
                        />
                      )}
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
