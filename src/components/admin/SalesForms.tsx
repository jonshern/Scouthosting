"use client";

import { useActionState, useState } from "react";
import {
  upsertCampaign,
  upsertProduct,
  addPrizeTier,
  createManualOrder,
  updateOrderStatus,
  recordBoothSale,
  generateScoutLinks,
  setItemDelivered,
  type SalesState,
} from "@/server-actions/sales";

function toLocalDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function CampaignForm({
  orgSlug,
  funds,
  initial,
  csrf,
}: {
  orgSlug: string;
  funds: { id: string; name: string }[];
  initial?: {
    id?: string;
    name?: string;
    startsOn?: Date;
    endsOn?: Date;
    fundId?: string;
    proceedsSplit?: string;
    scoutSplitPct?: number;
    publicSlug?: string | null;
    description?: string | null;
  };
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<SalesState, FormData>(upsertCampaign, null);
  const c = initial ?? {};
  return (
    <form action={action} className="card space-y-3">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {c.id ? <input type="hidden" name="id" value={c.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Campaign name</label>
          <input id="name" name="name" required defaultValue={c.name ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="fundId">Fund</label>
          <select id="fundId" name="fundId" required defaultValue={c.fundId ?? ""} className="field">
            <option value="" disabled>Pick a fund…</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="startsOn">Starts</label>
          <input id="startsOn" name="startsOn" type="date" required defaultValue={toLocalDate(c.startsOn)} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="endsOn">Ends</label>
          <input id="endsOn" name="endsOn" type="date" required defaultValue={toLocalDate(c.endsOn)} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="proceedsSplit">Proceeds split</label>
          <select id="proceedsSplit" name="proceedsSplit" defaultValue={c.proceedsSplit ?? "per-scout"} className="field">
            <option value="per-scout">Per-Scout (split to scout accounts)</option>
            <option value="whole-unit">Whole-unit (campaign fund only)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="scoutSplitPct">Scout share %</label>
          <input id="scoutSplitPct" name="scoutSplitPct" type="number" min={0} max={100} defaultValue={c.scoutSplitPct ?? 70} className="field" />
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="publicSlug">Public slug (optional)</label>
          <input id="publicSlug" name="publicSlug" defaultValue={c.publicSlug ?? ""} placeholder="popcorn-2026" className="field" />
          <p className="mt-1 text-xs text-slate-muted">If set, the campaign is reachable at <code>/sell/&lt;slug&gt;</code>.</p>
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="description">Description</label>
          <textarea id="description" name="description" rows={3} defaultValue={c.description ?? ""} className="field" />
        </div>
      </div>
      {state && "error" in state ? <p className="text-sm text-danger">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : c.id ? "Save campaign" : "Create campaign"}
      </button>
    </form>
  );
}

export function ProductForm({
  orgSlug,
  campaignId,
  csrf,
}: {
  orgSlug: string;
  campaignId: string;
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<SalesState, FormData>(upsertProduct, null);
  return (
    <form action={action} className="grid gap-2 md:grid-cols-5 items-end">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <div>
        <label className="label" htmlFor="sku">SKU</label>
        <input id="sku" name="sku" required maxLength={40} className="field" />
      </div>
      <div className="md:col-span-2">
        <label className="label" htmlFor="name">Name</label>
        <input id="name" name="name" required maxLength={120} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="price">Price ($)</label>
        <input id="price" name="price" required className="field" />
      </div>
      <div>
        <label className="label" htmlFor="unitCost">Unit cost ($)</label>
        <input id="unitCost" name="unitCost" className="field" />
      </div>
      <div className="md:col-span-5">
        {state && "error" in state ? <p className="text-sm text-danger">{state.error}</p> : null}
        <button type="submit" disabled={pending} className="btn-secondary">
          {pending ? "Adding…" : "Add product"}
        </button>
      </div>
    </form>
  );
}

export function PrizeForm({
  orgSlug,
  campaignId,
  csrf,
}: {
  orgSlug: string;
  campaignId: string;
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<SalesState, FormData>(addPrizeTier, null);
  return (
    <form action={action} className="grid gap-2 md:grid-cols-4 items-end">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <div>
        <label className="label" htmlFor="threshold">Threshold ($)</label>
        <input id="threshold" name="threshold" required className="field" />
      </div>
      <div>
        <label className="label" htmlFor="prize-name">Tier name</label>
        <input id="prize-name" name="name" required maxLength={80} className="field" />
      </div>
      <div className="md:col-span-2">
        <label className="label" htmlFor="prize-desc">Description</label>
        <input id="prize-desc" name="description" maxLength={500} className="field" />
      </div>
      <div className="md:col-span-4">
        {state && "error" in state ? <p className="text-sm text-danger">{state.error}</p> : null}
        <button type="submit" disabled={pending} className="btn-secondary">
          {pending ? "Adding…" : "Add prize tier"}
        </button>
      </div>
    </form>
  );
}

export function ManualOrderForm({
  orgSlug,
  campaignId,
  products,
  scouts,
  csrf,
}: {
  orgSlug: string;
  campaignId: string;
  products: { id: string; name: string; priceCents: number }[];
  scouts: { id: string; name: string }[];
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<SalesState, FormData>(createManualOrder, null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const items = JSON.stringify(
    Object.entries(qty)
      .map(([productId, q]) => ({ productId, quantity: q }))
      .filter((i) => i.quantity > 0),
  );
  const total = products.reduce((sum, p) => sum + (qty[p.id] ?? 0) * p.priceCents, 0);
  return (
    <form action={action} className="card space-y-3">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="items" value={items} />
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="buyerName">Buyer name</label>
          <input id="buyerName" name="buyerName" required maxLength={120} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="buyerEmail">Email</label>
          <input id="buyerEmail" name="buyerEmail" type="email" maxLength={320} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="buyerPhone">Phone</label>
          <input id="buyerPhone" name="buyerPhone" maxLength={40} className="field" />
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="buyerAddress">Address</label>
          <input id="buyerAddress" name="buyerAddress" maxLength={500} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="scoutMemberId">Selling Scout</label>
          <select id="scoutMemberId" name="scoutMemberId" defaultValue="" className="field">
            <option value="">— none / unattributed —</option>
            {scouts.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="source">Source</label>
          <select id="source" name="source" defaultValue="leader-manual" className="field">
            <option value="leader-manual">Leader-entered</option>
            <option value="scout-personal">Scout personal</option>
            <option value="booth">Booth</option>
          </select>
        </div>
      </div>
      <div>
        <h4 className="text-[11px] uppercase tracking-[0.12em] text-slate-muted mb-2">Items</h4>
        <div className="space-y-1 text-sm">
          {products.map((p) => (
            <label key={p.id} className="flex items-center gap-3 py-1">
              <span className="flex-1 text-ink">
                {p.name} <span className="text-slate-muted">· ${(p.priceCents / 100).toFixed(2)}</span>
              </span>
              <input
                type="number"
                min={0}
                value={qty[p.id] ?? 0}
                onChange={(e) =>
                  setQty((q) => ({ ...q, [p.id]: Math.max(0, parseInt(e.target.value, 10) || 0) }))
                }
                className="field w-20 text-right"
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-sm text-slate-soft">
          Total: <strong>${(total / 100).toFixed(2)}</strong>
        </p>
      </div>
      <div>
        <label className="label" htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={2} maxLength={2000} className="field" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="markPaid" /> Mark paid (post deposit + per-scout split)
      </label>
      {state && "error" in state ? <p className="text-sm text-danger">{state.error}</p> : null}
      <button type="submit" disabled={pending || total === 0} className="btn-primary">
        {pending ? "Saving…" : "Create order"}
      </button>
    </form>
  );
}

export function OrderStatusForm({
  orgSlug,
  orderId,
  current,
  csrf,
}: {
  orgSlug: string;
  orderId: string;
  current: string;
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<SalesState, FormData>(updateOrderStatus, null);
  return (
    <form action={action} className="flex items-center gap-2">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="orderId" value={orderId} />
      <select name="status" defaultValue={current} className="field text-xs">
        <option value="placed">Placed</option>
        <option value="paid">Paid</option>
        <option value="delivered">Delivered</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <button type="submit" disabled={pending} className="btn-secondary text-xs">
        {pending ? "…" : "Update"}
      </button>
      {state && "error" in state ? <p className="w-full text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}

export function ItemDeliveryForm({
  orgSlug,
  orderId,
  itemId,
  quantity,
  delivered,
  csrf,
}: {
  orgSlug: string;
  orderId: string;
  itemId: string;
  quantity: number;
  delivered: number;
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<SalesState, FormData>(
    setItemDelivered,
    null,
  );
  return (
    <form action={action} className="flex items-center gap-1">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="itemId" value={itemId} />
      <input
        type="number"
        name="quantityDelivered"
        defaultValue={delivered}
        min={0}
        max={quantity}
        className="field w-16 text-right text-xs"
      />
      <span className="text-xs text-slate-muted">/ {quantity}</span>
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-accent hover:text-ink ml-1"
      >
        {pending ? "…" : "Save"}
      </button>
      {state && "error" in state ? (
        <p className="text-xs text-danger ml-1">{state.error}</p>
      ) : null}
    </form>
  );
}

export function GenerateScoutLinksButton({
  orgSlug,
  campaignId,
  csrf,
}: {
  orgSlug: string;
  campaignId: string;
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<SalesState, FormData>(generateScoutLinks, null);
  return (
    <form action={action}>
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <button type="submit" disabled={pending} className="btn-secondary">
        {pending ? "Generating…" : "Generate scout links"}
      </button>
      {state && "error" in state ? <p className="text-sm text-danger">{state.error}</p> : null}
    </form>
  );
}

export function BoothSaleForm({
  orgSlug,
  campaignId,
  scouts,
  csrf,
}: {
  orgSlug: string;
  campaignId: string;
  scouts: { id: string; name: string }[];
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<SalesState, FormData>(recordBoothSale, null);
  const [staff, setStaff] = useState<string[]>([]);
  return (
    <form action={action} className="card space-y-3">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="staffMemberIds" value={staff.join(",")} />
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="location">Location</label>
          <input id="location" name="location" required maxLength={120} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="scheduledAt">When</label>
          <input id="scheduledAt" name="scheduledAt" type="datetime-local" required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="total">Total ($)</label>
          <input id="total" name="total" required className="field" />
        </div>
      </div>
      <div>
        <label className="label">Staff (Scouts who worked)</label>
        <div className="grid gap-1 max-h-48 overflow-auto rounded-md border border-line p-2 text-sm">
          {scouts.map((s) => (
            <label key={s.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={staff.includes(s.id)}
                onChange={(e) => {
                  setStaff((cur) =>
                    e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id),
                  );
                }}
              />
              <span>{s.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="booth-notes">Notes</label>
        <textarea id="booth-notes" name="notes" rows={2} maxLength={2000} className="field" />
      </div>
      {state && "error" in state ? <p className="text-sm text-danger">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : "Record booth sale"}
      </button>
    </form>
  );
}
