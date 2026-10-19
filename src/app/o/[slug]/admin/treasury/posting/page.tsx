// Common posting workflows in one page: single-member transaction,
// bulk dues, fund-to-fund transfer.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import {
  PostTransactionForm,
  BulkDuesForm,
  TransferForm,
} from "@/components/admin/TreasuryForms";
import { requireTreasuryPage } from "@/lib/admin/guard";

export const metadata = { title: "Posting" };

export default async function TreasuryPostingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireTreasuryPage(slug);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  const [funds, members, events] = await Promise.all([
    prisma.fund.findMany({
      where: { orgId: org.id, archived: false },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: { id: true, code: true, name: true },
    }),
    prisma.member.findMany({
      where: { orgId: org.id, deletedAt: null, status: { in: ["active", "prospect"] } },
    }),
    prisma.event.findMany({
      where: { orgId: org.id, startsAt: { gte: new Date(Date.now() - 60 * 86400_000) } },
      orderBy: { startsAt: "desc" },
      select: { id: true, title: true },
      take: 50,
    }),
  ]);

  const memberOptions = (() => {
    if (!org.encryptedDek) return [];
    const dek = unwrapDekWithMaster(org);
    return members
      .map((m) => {
        const pii = decryptMemberPii(m, dek, org.id);
        return { id: m.id, name: `${pii.firstName} ${pii.lastName}`.trim(), patrol: m.patrol };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  })();

  const patrols = [...new Set(memberOptions.map((m) => m.patrol).filter(Boolean) as string[])].sort();

  return (
    <section className="space-y-10">
      <AdminPageHeader
        kicker="Treasury"
        title="Posting"
        description="Charge or credit members, post bulk dues, transfer between funds."
        actions={
          <Link href={`/o/${slug}/admin/treasury`} className="btn-secondary">
            ← Overview
          </Link>
        }
      />

      <div>
        <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink mb-3">Post a transaction</h2>
        <PostTransactionForm
          orgSlug={slug}
          funds={funds}
          members={memberOptions}
          events={events}
          csrf={<CsrfTokenInput />}
        />
      </div>

      <div>
        <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink mb-3">Bulk dues</h2>
        <BulkDuesForm orgSlug={slug} patrols={patrols} csrf={<CsrfTokenInput />} />
      </div>

      <div>
        <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink mb-3">Transfer between funds</h2>
        <TransferForm orgSlug={slug} funds={funds} csrf={<CsrfTokenInput />} />
      </div>
    </section>
  );
}
