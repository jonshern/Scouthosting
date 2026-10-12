// Sales / fundraising hub. Lists campaigns and lets the leader create
// a new one.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { CampaignForm } from "@/components/admin/SalesForms";
import { Pill } from "@/components/ui";
import { requireAdminPage } from "@/lib/admin/guard";
export default async function SalesHub({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();

  const [funds, campaigns] = await Promise.all([
    prisma.fund.findMany({
      where: { orgId: org.id, archived: false },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.salesCampaign.findMany({
      where: { orgId: org.id },
      orderBy: { endsOn: "desc" },
      include: { _count: { select: { orders: true } }, fund: true },
    }),
  ]);

  if (funds.length === 0) {
    return (
      <section className="space-y-6">
        <AdminPageHeader
          kicker="Sales"
          title="Set up Treasury first"
          description="Sales campaigns need a Fund to deposit proceeds into. Provision Treasury before creating campaigns."
        />
        <Link href={`/o/${slug}/admin/treasury`} className="btn-primary">
          Provision Treasury →
        </Link>
      </section>
    );
  }

  const now = new Date();
  return (
    <section className="space-y-10">
      <AdminPageHeader
        kicker="Sales"
        title="Fundraising campaigns"
        description="Run popcorn / camp-card / wreath sales. Settlement lands in the Treasury ledger."
      />
      <div>
        <h2 className="font-display text-2xl tracking-[-0.015em] text-ink mb-3">Campaigns</h2>
        {campaigns.length === 0 ? (
          <p className="text-sm text-slate-muted">No campaigns yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-left text-[11px] uppercase tracking-[0.08em] text-slate-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Name</th>
                  <th className="px-4 py-2 font-semibold">Window</th>
                  <th className="px-4 py-2 font-semibold">Fund</th>
                  <th className="px-4 py-2 font-semibold">Orders</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {campaigns.map((c) => {
                  const active = !c.closedAt && c.endsOn > now && c.startsOn <= now;
                  const upcoming = !c.closedAt && c.startsOn > now;
                  const ended = c.closedAt || c.endsOn < now;
                  return (
                    <tr key={c.id}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/o/${slug}/admin/sales/${c.id}`}
                          className="font-medium text-ink hover:text-sky"
                        >
                          {c.name}
                        </Link>
                        {c.publicSlug ? (
                          <div className="text-xs text-slate-muted font-mono">/sell/{c.publicSlug}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-soft">
                        {c.startsOn.toLocaleDateString()} – {c.endsOn.toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-slate-soft">{c.fund.name}</td>
                      <td className="px-4 py-3 text-slate-soft">{c._count.orders}</td>
                      <td className="px-4 py-3">
                        {active ? (
                          <Pill tone="success">Active</Pill>
                        ) : upcoming ? (
                          <Pill tone="amber">Upcoming</Pill>
                        ) : (
                          <Pill tone="neutral">{c.closedAt ? "Closed" : "Ended"}</Pill>
                        )}
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
        <h2 className="font-display text-2xl tracking-[-0.015em] text-ink mb-3">New campaign</h2>
        <CampaignForm orgSlug={slug} funds={funds} csrf={<CsrfTokenInput />} />
      </div>
    </section>
  );
}

