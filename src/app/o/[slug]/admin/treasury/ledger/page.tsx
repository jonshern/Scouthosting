// Ledger view — paged list of transactions with filters. Reversed
// pairs are shown as collapsed by default; flip ?showReversed=1 to
// see both rows individually.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { ReverseButton } from "@/components/admin/TreasuryForms";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { centsToDollars, TX_TYPE_LABELS, type TxType } from "@/lib/treasury/money";
import { Pill } from "@/components/ui";

type Search = {
  fund?: string;
  member?: string;
  type?: string;
  before?: string;
  showReversed?: string;
};

const PAGE = 100;

export default async function TreasuryLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  const showReversed = sp.showReversed === "1";

  const where = {
    orgId: org.id,
    ...(sp.fund ? { fundId: sp.fund } : {}),
    ...(sp.member ? { memberId: sp.member } : {}),
    ...(sp.type ? { type: sp.type } : {}),
    ...(sp.before ? { postedAt: { lt: new Date(sp.before) } } : {}),
  };

  const rows = await prisma.transaction.findMany({
    where,
    orderBy: [{ postedAt: "desc" }, { id: "desc" }],
    take: PAGE + 1,
    include: { fund: true, reverses: true },
  });

  const hasMore = rows.length > PAGE;
  const visible = hasMore ? rows.slice(0, PAGE) : rows;

  // Identify reversal pairs to collapse. Original-and-reversal pairs
  // share `reversesId === orig.id` on the newer row.
  const reversedIds = new Set<string>();
  const reversalIds = new Set<string>();
  for (const r of visible) {
    if (r.reversesId) {
      reversedIds.add(r.reversesId);
      reversalIds.add(r.id);
    }
  }

  const display = showReversed
    ? visible
    : visible.filter((r) => !reversedIds.has(r.id) && !reversalIds.has(r.id));

  const memberIds = [...new Set(visible.map((r) => r.memberId).filter(Boolean) as string[])];
  const memberLabels = new Map<string, string>();
  if (org.encryptedDek && memberIds.length > 0) {
    const dek = unwrapDekWithMaster(org);
    const members = await prisma.member.findMany({ where: { id: { in: memberIds } } });
    for (const m of members) {
      const pii = decryptMemberPii(m, dek, org.id);
      memberLabels.set(m.id, `${pii.firstName} ${pii.lastName}`.trim());
    }
  }

  const fundOptions = await prisma.fund.findMany({
    where: { orgId: org.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const baseQuery = new URLSearchParams();
  for (const k of ["fund", "member", "type", "showReversed"] as const) {
    if (sp[k]) baseQuery.set(k, sp[k]!);
  }
  const nextHref =
    hasMore && visible[visible.length - 1]
      ? (() => {
          const q = new URLSearchParams(baseQuery);
          q.set("before", visible[visible.length - 1]!.postedAt.toISOString());
          return `?${q.toString()}`;
        })()
      : null;

  return (
    <section className="space-y-6">
      <AdminPageHeader
        kicker="Treasury"
        title="Ledger"
        description="Every transaction in reverse chronological order. Reversal pairs are collapsed by default."
        actions={
          <Link href={`/o/${slug}/admin/treasury`} className="btn-secondary">
            ← Overview
          </Link>
        }
      />

      <form action="" method="GET" className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="fund">Fund</label>
          <select id="fund" name="fund" defaultValue={sp.fund ?? ""} className="field">
            <option value="">All</option>
            {fundOptions.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="type">Type</label>
          <select id="type" name="type" defaultValue={sp.type ?? ""} className="field">
            <option value="">All</option>
            {Object.entries(TX_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="member">Member ID</label>
          <input id="member" name="member" defaultValue={sp.member ?? ""} className="field" />
        </div>
        <label className="text-sm flex items-center gap-2 mb-2">
          <input
            type="checkbox"
            name="showReversed"
            value="1"
            defaultChecked={showReversed}
          /> Show reversed pairs
        </label>
        <button type="submit" className="btn-secondary">Apply</button>
        <Link
          href={`/o/${slug}/admin/treasury/ledger.csv${baseQuery.toString() ? `?${baseQuery}` : ""}`}
          className="text-sm text-slate-soft hover:text-sky"
        >
          Download CSV →
        </Link>
      </form>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-left text-[11px] uppercase tracking-[0.08em] text-slate-muted">
            <tr>
              <th className="px-4 py-2 font-semibold">Posted</th>
              <th className="px-4 py-2 font-semibold">Fund</th>
              <th className="px-4 py-2 font-semibold">Type</th>
              <th className="px-4 py-2 font-semibold">Member</th>
              <th className="px-4 py-2 font-semibold">Description</th>
              <th className="px-4 py-2 font-semibold text-right">Amount</th>
              <th className="px-4 py-2 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {display.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-muted">
                  No transactions match.
                </td>
              </tr>
            ) : (
              display.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-slate-soft whitespace-nowrap">
                    {r.postedAt.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-soft">{r.fund.name}</td>
                  <td className="px-4 py-3">
                    <Pill tone={r.amountCents >= 0 ? "success" : "danger"}>
                      {TX_TYPE_LABELS[r.type as TxType] ?? r.type}
                    </Pill>
                  </td>
                  <td className="px-4 py-3 text-slate-soft">
                    {r.memberId ? (
                      <Link
                        href={`/o/${slug}/admin/treasury/members/${r.memberId}`}
                        className="hover:text-sky"
                      >
                        {memberLabels.get(r.memberId) ?? r.memberId.slice(0, 8)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-soft">
                    {r.description}
                    {r.reverses ? (
                      <span className="ml-2 text-xs text-slate-muted">
                        (reverses {r.reversesId?.slice(0, 8)})
                      </span>
                    ) : null}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono ${
                      r.amountCents < 0 ? "text-danger" : "text-success"
                    }`}
                  >
                    {centsToDollars(r.amountCents)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.reversesId ? (
                      <span className="text-xs text-slate-muted">reversal</span>
                    ) : (
                      <ReverseButton
                        orgSlug={slug}
                        txnId={r.id}
                        csrf={<CsrfTokenInput />}
                      />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-muted">
        <span>{display.length} entries</span>
        {nextHref ? (
          <Link href={nextHref} className="text-sky hover:text-ink">
            Older entries →
          </Link>
        ) : null}
      </div>
    </section>
  );
}
