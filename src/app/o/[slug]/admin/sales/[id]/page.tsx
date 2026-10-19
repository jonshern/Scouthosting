// Single campaign detail. Tabs in one scroll: products, prize tiers,
// leaderboard, orders, booth sales, council CSV link.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";
import {
  CampaignForm,
  ProductForm,
  PrizeForm,
  ManualOrderForm,
  OrderStatusForm,
  BoothSaleForm,
  GenerateScoutLinksButton,
  ItemDeliveryForm,
} from "@/components/admin/SalesForms";
import { Pill, Stat, StatRow } from "@/components/ui";
import { centsToDollars } from "@/lib/treasury/money";
import {
  leaderboardForCampaign,
  reachedPrizeTiers,
  summarizeCampaign,
} from "@/lib/sales";
import { requireAdminPage } from "@/lib/admin/guard";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  await requireAdminPage(slug);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const campaign = await prisma.salesCampaign.findUnique({
    where: { id, orgId: org.id },
  });
  if (!campaign) notFound();

  const [funds, products, prizes, summary, board, members, orders, booths] = await Promise.all([
    prisma.fund.findMany({
      where: { orgId: org.id, archived: false },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.salesProduct.findMany({
      where: { campaignId: campaign.id, archived: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.prizeTier.findMany({
      where: { campaignId: campaign.id },
      orderBy: { thresholdCents: "asc" },
    }),
    summarizeCampaign(campaign.id),
    leaderboardForCampaign(org, campaign.id),
    prisma.member.findMany({
      where: { orgId: org.id, deletedAt: null, status: { in: ["active", "prospect"] } },
    }),
    prisma.salesOrder.findMany({
      where: { orgId: org.id, campaignId: campaign.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { items: { include: { product: true } } },
    }),
    prisma.boothSale.findMany({
      where: { orgId: org.id, campaignId: campaign.id },
      orderBy: { scheduledAt: "desc" },
      take: 50,
    }),
  ]);

  const dek = org.encryptedDek ? unwrapDekWithMaster(org) : null;
  const memberLabels = new Map<string, string>();
  if (dek) {
    for (const m of members) {
      const pii = decryptMemberPii(m, dek, org.id);
      memberLabels.set(m.id, `${pii.firstName} ${pii.lastName}`.trim());
    }
  }

  // Pre-compute prize tier hits for every leaderboard row so we can
  // render synchronously inside the table.
  const allTiers = await reachedPrizeTiers(campaign.id, Number.POSITIVE_INFINITY);
  const tierHitsByRow = board.map((row) =>
    allTiers
      .filter((t) => row.totalCents >= t.thresholdCents)
      .map((t) => ({ id: t.id, name: t.name })),
  );
  const scoutOptions = [...memberLabels.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="space-y-10">
      <AdminPageHeader
        kicker="Sales · Campaign"
        title={campaign.name}
        description={`${campaign.startsOn.toLocaleDateString()} – ${campaign.endsOn.toLocaleDateString()} · ${
          campaign.proceedsSplit === "per-scout"
            ? `Per-Scout split @ ${campaign.scoutSplitPct}%`
            : "Whole-unit"
        }`}
        actions={
          <>
            <Link href={`/o/${slug}/admin/sales`} className="btn-secondary">← Campaigns</Link>
            <Link
              href={`/o/${slug}/admin/sales/${campaign.id}/export.csv`}
              className="btn-secondary"
            >
              Council CSV
            </Link>
            {campaign.publicSlug ? (
              <Link href={`/sell/${campaign.publicSlug}`} className="btn-secondary">
                Public page →
              </Link>
            ) : null}
          </>
        }
      />

      <StatRow>
        <Stat label="Orders placed" value={summary.ordersPlaced} />
        <Stat label="Paid" value={summary.ordersPaid} tone="success" />
        <Stat label="Gross" value={centsToDollars(summary.grossCents)} tone="accent" />
        <Stat label="Paid total" value={centsToDollars(summary.paidCents)} />
      </StatRow>

      <div>
        <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink mb-3">Edit campaign</h2>
        <CampaignForm
          orgSlug={slug}
          funds={funds}
          initial={{
            id: campaign.id,
            name: campaign.name,
            startsOn: campaign.startsOn,
            endsOn: campaign.endsOn,
            fundId: campaign.fundId,
            proceedsSplit: campaign.proceedsSplit,
            scoutSplitPct: campaign.scoutSplitPct,
            publicSlug: campaign.publicSlug,
            description: campaign.description,
          }}
          csrf={<CsrfTokenInput />}
        />
      </div>

      <div>
        <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink mb-3">Products</h2>
        {products.length === 0 ? (
          <p className="text-sm text-slate-muted mb-3">No products yet.</p>
        ) : (
          <ul className="text-sm divide-y divide-line mb-4">
            {products.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between py-2">
                <span>
                  <strong className="text-ink">{p.name}</strong>{" "}
                  <span className="font-mono text-xs text-slate-muted">{p.sku}</span>
                </span>
                <span className="font-mono text-slate-soft">{centsToDollars(p.priceCents)}</span>
              </li>
            ))}
          </ul>
        )}
        <ProductForm orgSlug={slug} campaignId={campaign.id} csrf={<CsrfTokenInput />} />
      </div>

      <div>
        <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink mb-3">Prize tiers</h2>
        {prizes.length === 0 ? (
          <p className="text-sm text-slate-muted mb-3">No prize tiers yet.</p>
        ) : (
          <ul className="text-sm divide-y divide-line mb-4">
            {prizes.map((t) => (
              <li key={t.id} className="flex items-baseline justify-between py-2">
                <span>
                  <strong className="text-ink">{t.name}</strong>
                  {t.description ? <span className="text-slate-muted"> · {t.description}</span> : null}
                </span>
                <span className="font-mono text-slate-soft">{centsToDollars(t.thresholdCents)}</span>
              </li>
            ))}
          </ul>
        )}
        <PrizeForm orgSlug={slug} campaignId={campaign.id} csrf={<CsrfTokenInput />} />
      </div>

      <div>
        <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink mb-3">Leaderboard</h2>
        {board.length === 0 ? (
          <p className="text-sm text-slate-muted">No orders yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-left text-[11px] uppercase tracking-[0.08em] text-slate-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Rank</th>
                  <th className="px-4 py-2 font-semibold">Scout</th>
                  <th className="px-4 py-2 font-semibold text-right">Sold</th>
                  <th className="px-4 py-2 font-semibold text-right">Orders</th>
                  <th className="px-4 py-2 font-semibold">Tiers reached</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {board.map((row, i) => {
                  const tiersHit = tierHitsByRow[i] ?? [];
                  return (
                    <tr key={row.memberId ?? `__${i}`}>
                      <td className="px-4 py-3 text-slate-soft">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-ink">
                        {row.scoutName}
                        {row.patrol ? <span className="text-xs text-slate-muted ml-1">· {row.patrol}</span> : null}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-success">
                        {centsToDollars(row.totalCents)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-soft">{row.orders}</td>
                      <td className="px-4 py-3 text-xs">
                        {tiersHit.length === 0 ? (
                          <span className="text-slate-muted">—</span>
                        ) : (
                          tiersHit.map((t) => (
                            <Pill key={t.id} tone="amber" className="mr-1">{t.name}</Pill>
                          ))
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

      {campaign.publicSlug ? (
        <div>
          <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink mb-3">Per-Scout sales links</h2>
          <p className="text-sm text-slate-muted mb-3">
            Generate a public URL per active youth so each Scout has a personal page.
          </p>
          <GenerateScoutLinksButton
            orgSlug={slug}
            campaignId={campaign.id}
            csrf={<CsrfTokenInput />}
          />
        </div>
      ) : null}

      <div>
        <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink mb-3">New manual order</h2>
        <ManualOrderForm
          orgSlug={slug}
          campaignId={campaign.id}
          products={products.map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents }))}
          scouts={scoutOptions}
          csrf={<CsrfTokenInput />}
        />
      </div>

      <div>
        <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink mb-3">Recent orders</h2>
        {orders.length === 0 ? (
          <p className="text-sm text-slate-muted">No orders yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-left text-[11px] uppercase tracking-[0.08em] text-slate-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">When</th>
                  <th className="px-4 py-2 font-semibold">Buyer</th>
                  <th className="px-4 py-2 font-semibold">Source</th>
                  <th className="px-4 py-2 font-semibold">Scout</th>
                  <th className="px-4 py-2 font-semibold text-right">Total</th>
                  <th className="px-4 py-2 font-semibold">Items / delivered</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((o) => {
                  const totalQty = o.items.reduce((s, i) => s + i.quantity, 0);
                  const totalDelivered = o.items.reduce(
                    (s, i) => s + i.quantityDelivered,
                    0,
                  );
                  return (
                    <tr key={o.id}>
                      <td className="px-4 py-3 text-slate-soft whitespace-nowrap">
                        {o.createdAt.toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-ink">{o.buyerName}</td>
                      <td className="px-4 py-3 text-slate-soft text-xs">{o.source}</td>
                      <td className="px-4 py-3 text-slate-soft text-xs">
                        {o.scoutMemberId ? memberLabels.get(o.scoutMemberId) ?? "(removed)" : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {centsToDollars(o.totalCents)}
                      </td>
                      <td className="px-4 py-3">
                        <details className="text-xs">
                          <summary className="cursor-pointer text-slate-soft">
                            {totalDelivered}/{totalQty} delivered
                          </summary>
                          <div className="mt-2 space-y-1">
                            {o.items.map((it) => (
                              <div
                                key={it.id}
                                className="flex flex-wrap items-center justify-between gap-2"
                              >
                                <span className="text-ink">{it.product.name}</span>
                                <ItemDeliveryForm
                                  orgSlug={slug}
                                  orderId={o.id}
                                  itemId={it.id}
                                  quantity={it.quantity}
                                  delivered={it.quantityDelivered}
                                  csrf={<CsrfTokenInput />}
                                />
                              </div>
                            ))}
                          </div>
                        </details>
                      </td>
                      <td className="px-4 py-3">
                        <OrderStatusForm
                          orgSlug={slug}
                          orderId={o.id}
                          current={o.status}
                          csrf={<CsrfTokenInput />}
                        />
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
        <h2 className="font-display font-semibold text-2xl tracking-[-0.015em] text-ink mb-3">Booth sales</h2>
        {booths.length === 0 ? (
          <p className="text-sm text-slate-muted mb-3">No booth sales recorded.</p>
        ) : (
          <ul className="text-sm divide-y divide-line mb-4">
            {booths.map((b) => (
              <li key={b.id} className="flex items-baseline justify-between py-2">
                <span>
                  <strong className="text-ink">{b.location}</strong>
                  <span className="text-slate-muted"> · {b.scheduledAt.toLocaleString()}</span>
                </span>
                <span className="font-mono text-success">{centsToDollars(b.totalCents)}</span>
              </li>
            ))}
          </ul>
        )}
        <BoothSaleForm
          orgSlug={slug}
          campaignId={campaign.id}
          scouts={scoutOptions}
          csrf={<CsrfTokenInput />}
        />
      </div>
    </section>
  );
}
