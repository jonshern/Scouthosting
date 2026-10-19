// Thank-you page after a successful Stripe checkout. Stripe redirects
// here with ?order=<id>; we display the receipt details (no auth
// required — the URL is unguessable enough for a v1 confirmation).

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Wordmark } from "@/components/ui";
import { centsToDollars } from "@/lib/treasury/money";

export const dynamic = "force-dynamic";

export default async function ThanksPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignSlug: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  const { campaignSlug } = await params;
  const sp = await searchParams;
  if (!sp.order) notFound();

  const order = await prisma.salesOrder.findUnique({
    where: { id: sp.order },
    include: { items: { include: { product: true } }, campaign: true },
  });
  if (!order) notFound();
  if (order.campaign.publicSlug !== campaignSlug) notFound();

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <Wordmark />
      <h1 className="mt-10 font-display font-semibold text-3xl text-ink">Thank you!</h1>
      <p className="mt-2 text-sm text-slate-soft">
        Your order is in. We&rsquo;ll email a receipt to{" "}
        <strong>{order.buyerEmail ?? "you"}</strong>.
      </p>
      <div className="mt-8 rounded-xl border border-line bg-surface p-6">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Order</h2>
        <ul className="mt-3 divide-y divide-line">
          {order.items.map((it) => (
            <li key={it.id} className="flex items-baseline justify-between py-2 text-sm">
              <span>
                <strong className="text-ink">{it.product.name}</strong>
                <span className="text-slate-muted"> × {it.quantity}</span>
              </span>
              <span className="font-mono">
                {centsToDollars(it.priceCentsAtOrder * it.quantity)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
          <span className="font-display font-semibold text-lg text-ink">Total</span>
          <span className="font-mono text-lg">{centsToDollars(order.totalCents)}</span>
        </div>
      </div>
      <p className="mt-8 text-sm text-slate-muted">
        Status:{" "}
        <strong className="text-ink">
          {order.status === "paid" ? "Paid — settling now" : order.status}
        </strong>
        . If your payment cleared but the page still says &ldquo;placed&rdquo;, give it a
        minute and refresh.
      </p>
      <Link href={`/sell/${campaignSlug}`} className="mt-6 inline-block text-sm text-sky">
        Back to fundraiser →
      </Link>
    </main>
  );
}
