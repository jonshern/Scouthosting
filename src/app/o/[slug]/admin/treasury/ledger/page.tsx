// Ledger view — paged list of transactions with filters. Reversed
// pairs are shown as collapsed by default; flip ?showReversed=1 to
// see both rows individually.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { TX_TYPE_LABELS } from "@/lib/treasury/money";
import { LedgerGrid, type LedgerRow } from "@/components/admin/LedgerGrid";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";

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

      <LedgerGrid
        orgSlug={slug}
        csrfNode={<CsrfTokenInput />}
        rows={display.map<LedgerRow>((r) => ({
          id: r.id,
          postedAtIso: r.postedAt.toISOString(),
          fundName: r.fund.name,
          type: r.type,
          memberId: r.memberId,
          memberLabel: r.memberId ? memberLabels.get(r.memberId) ?? null : null,
          description: r.description,
          reversesId: r.reversesId,
          amountCents: r.amountCents,
        }))}
      />

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
