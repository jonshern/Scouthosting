// Per-member treasury detail. Running balance + transaction history.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import { Pill, Stat, StatRow } from "@/components/ui";
import {
  centsToDollars,
  formatBalance,
  TX_TYPE_LABELS,
  type TxType,
  SCOUT_ACCOUNTS,
} from "@/lib/treasury/money";
import { requireTreasuryPage } from "@/lib/admin/guard";

export default async function MemberTreasuryDetail({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  await requireTreasuryPage(slug);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const member = await prisma.member.findUnique({
    where: { id, orgId: org.id },
  });
  if (!member) notFound();

  let scoutName = member.email ?? "Member";
  if (org.encryptedDek) {
    const dek = unwrapDekWithMaster(org);
    const pii = decryptMemberPii(member, dek, org.id);
    scoutName = `${pii.firstName} ${pii.lastName}`.trim() || scoutName;
  }

  const [sub, txns, scoutAcctsFund] = await Promise.all([
    prisma.memberSubaccount.findUnique({ where: { memberId: member.id } }),
    prisma.transaction.findMany({
      where: { orgId: org.id, memberId: member.id },
      orderBy: [{ postedAt: "desc" }],
      include: { fund: true },
      take: 500,
    }),
    prisma.fund.findUnique({
      where: { orgId_code: { orgId: org.id, code: SCOUT_ACCOUNTS } },
    }),
  ]);

  // Compute running balance only against scout-accounts. Other-fund
  // postings (like a fundraiser-credit) appear in history but don't
  // contribute to the family's owe-balance.
  let running = 0;
  const withRunning = [...txns].reverse().map((t) => {
    const inScoutAccts = scoutAcctsFund && t.fundId === scoutAcctsFund.id;
    if (inScoutAccts) running += t.amountCents;
    return { ...t, runningCents: running, inScoutAccts: !!inScoutAccts };
  });
  withRunning.reverse();

  return (
    <section className="space-y-8">
      <AdminPageHeader
        kicker="Treasury · Member"
        title={`${scoutName} — account detail`}
        description={member.isYouth ? "Youth subaccount" : "Adult subaccount"}
        actions={
          <>
            <Link href={`/o/${slug}/admin/members/${member.id}`} className="btn-secondary">
              Member detail
            </Link>
            <Link href={`/o/${slug}/admin/treasury/posting`} className="btn-secondary">
              Posting
            </Link>
          </>
        }
      />
      <StatRow>
        <Stat
          label="Current balance"
          value={formatBalance(sub?.balanceCents ?? 0)}
          tone={(sub?.balanceCents ?? 0) < 0 ? "danger" : "success"}
          sub={(sub?.balanceCents ?? 0) < 0 ? "Family owes the unit" : "No outstanding balance"}
        />
        <Stat label="Transactions" value={txns.length} />
        <Stat label="Funds touched" value={new Set(txns.map((t) => t.fundId)).size} />
      </StatRow>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-left font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            <tr>
              <th className="px-4 py-2 font-semibold">Posted</th>
              <th className="px-4 py-2 font-semibold">Fund</th>
              <th className="px-4 py-2 font-semibold">Type</th>
              <th className="px-4 py-2 font-semibold">Description</th>
              <th className="px-4 py-2 font-semibold text-right">Amount</th>
              <th className="px-4 py-2 font-semibold text-right">Running</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {withRunning.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-muted">
                  No transactions yet.
                </td>
              </tr>
            ) : (
              withRunning.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 text-slate-soft">{t.postedAt.toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-soft">{t.fund.name}</td>
                  <td className="px-4 py-3">
                    <Pill tone={t.amountCents >= 0 ? "success" : "danger"}>
                      {TX_TYPE_LABELS[t.type as TxType] ?? t.type}
                    </Pill>
                  </td>
                  <td className="px-4 py-3 text-slate-soft">{t.description}</td>
                  <td
                    className={`px-4 py-3 text-right font-mono ${
                      t.amountCents < 0 ? "text-danger" : "text-success"
                    }`}
                  >
                    {centsToDollars(t.amountCents)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-soft font-mono">
                    {t.inScoutAccts ? formatBalance(t.runningCents) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
