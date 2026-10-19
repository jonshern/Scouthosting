"use client";

import { useActionState, useState } from "react";
import { startPublicCheckout } from "@/server-actions/public-sales";
import { centsToDollars } from "@/lib/treasury/money";

export function PublicSalesCart({
  publicSlug,
  scoutSlug,
  products,
  csrf,
}: {
  publicSlug: string;
  scoutSlug?: string;
  products: { id: string; name: string; priceCents: number; imageUrl: string | null }[];
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<{ error?: string } | null, FormData>(
    startPublicCheckout,
    null,
  );
  const [qty, setQty] = useState<Record<string, number>>({});
  const items = JSON.stringify(
    Object.entries(qty)
      .map(([productId, q]) => ({ productId, quantity: q }))
      .filter((i) => i.quantity > 0),
  );
  const total = products.reduce((sum, p) => sum + (qty[p.id] ?? 0) * p.priceCents, 0);

  return (
    <form action={action} className="space-y-6">
      {csrf}
      <input type="hidden" name="publicSlug" value={publicSlug} />
      {scoutSlug ? <input type="hidden" name="scoutSlug" value={scoutSlug} /> : null}
      <input type="hidden" name="items" value={items} />

      <div className="space-y-3">
        {products.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4"
          >
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.imageUrl} alt="" className="h-16 w-16 rounded object-cover" />
            ) : (
              <div className="h-16 w-16 rounded bg-surface-alt" />
            )}
            <div className="flex-1">
              <div className="font-medium text-ink">{p.name}</div>
              <div className="text-sm text-slate-soft">{centsToDollars(p.priceCents)}</div>
            </div>
            <input
              type="number"
              min={0}
              value={qty[p.id] ?? 0}
              onChange={(e) =>
                setQty((cur) => ({
                  ...cur,
                  [p.id]: Math.max(0, parseInt(e.target.value, 10) || 0),
                }))
              }
              className="field w-20 text-right"
            />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-surface-alt p-4 text-right">
        <span className="text-sm text-slate-muted">Total: </span>
        <span className="font-display font-semibold text-2xl text-ink">{centsToDollars(total)}</span>
      </div>

      <fieldset className="grid gap-3 md:grid-cols-2">
        <legend className="font-display font-semibold text-lg text-ink mb-2 col-span-full">
          Your details
        </legend>
        <div>
          <label className="label" htmlFor="buyerName">Name</label>
          <input id="buyerName" name="buyerName" required maxLength={120} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="buyerEmail">Email</label>
          <input id="buyerEmail" name="buyerEmail" type="email" required maxLength={320} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="buyerPhone">Phone (optional)</label>
          <input id="buyerPhone" name="buyerPhone" maxLength={40} className="field" />
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="buyerAddress">Delivery address (optional)</label>
          <input id="buyerAddress" name="buyerAddress" maxLength={500} className="field" />
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" rows={2} maxLength={2000} className="field" />
        </div>
      </fieldset>

      {state?.error ? (
        <p className="rounded-md border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending || total === 0} className="btn-primary w-full">
        {pending ? "Redirecting…" : `Pay ${centsToDollars(total)} with card`}
      </button>
    </form>
  );
}
