"use client";

import { useActionState } from "react";
import {
  postTransactionAction,
  postBulkDuesAction,
  postTransferAction,
  reverseTransactionAction,
  recomputeBalancesAction,
  provisionTreasuryAction,
  type TreasuryState,
} from "@/server-actions/treasury";

export function ProvisionButton({
  orgSlug,
  csrf,
}: {
  orgSlug: string;
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<TreasuryState, FormData>(
    provisionTreasuryAction,
    null,
  );
  return (
    <form action={action} className="space-y-2">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Provisioning…" : "Provision treasury"}
      </button>
      {state && "error" in state ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state && "ok" in state ? <p className="text-sm text-success">{state.message}</p> : null}
    </form>
  );
}

export function PostTransactionForm({
  orgSlug,
  funds,
  members,
  events,
  csrf,
}: {
  orgSlug: string;
  funds: { id: string; code: string; name: string }[];
  members: { id: string; name: string }[];
  events: { id: string; title: string }[];
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<TreasuryState, FormData>(
    postTransactionAction,
    null,
  );
  return (
    <form action={action} className="card space-y-4">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="type">Type</label>
          <select id="type" name="type" className="field" defaultValue="manual">
            <option value="dues">Dues</option>
            <option value="event-charge">Event charge</option>
            <option value="deposit">Deposit</option>
            <option value="expense">Expense</option>
            <option value="fundraiser-credit">Fundraiser credit</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="fundId">Fund</label>
          <select id="fundId" name="fundId" required className="field" defaultValue="">
            <option value="" disabled>Pick a fund…</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="amount">Amount ($)</label>
          <input id="amount" name="amount" required className="field" placeholder="25.00" />
        </div>
        <div>
          <label className="label" htmlFor="sign">Direction</label>
          <select id="sign" name="sign" className="field" defaultValue="charge">
            <option value="charge">Charge (subaccount goes negative)</option>
            <option value="credit">Credit (subaccount goes positive)</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="description">Description</label>
        <input id="description" name="description" required maxLength={500} className="field" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="memberId">Member (optional)</label>
          <select id="memberId" name="memberId" className="field" defaultValue="">
            <option value="">— none —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="eventId">Event (optional)</label>
          <select id="eventId" name="eventId" className="field" defaultValue="">
            <option value="">— none —</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>
        </div>
      </div>
      {state && "error" in state ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state && "ok" in state ? <p className="text-sm text-success">{state.message}</p> : null}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Posting…" : "Post transaction"}
      </button>
    </form>
  );
}

export function BulkDuesForm({
  orgSlug,
  patrols,
  csrf,
}: {
  orgSlug: string;
  patrols: string[];
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<TreasuryState, FormData>(
    postBulkDuesAction,
    null,
  );
  return (
    <form action={action} className="card space-y-3">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="bulk-amount">Amount per member</label>
          <input id="bulk-amount" name="amount" required className="field" placeholder="50.00" />
        </div>
        <div>
          <label className="label" htmlFor="bulk-scope">Scope</label>
          <select id="bulk-scope" name="scope" className="field" defaultValue="all-active">
            <option value="all-active">All active members</option>
            <option value="youth">Youth only</option>
            <option value="adults">Adults only</option>
            <option value="patrol">Specific patrol</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="bulk-patrol">Patrol (if scope=patrol)</label>
          <select id="bulk-patrol" name="patrol" className="field" defaultValue="">
            <option value="">— pick —</option>
            {patrols.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="bulk-description">Description</label>
        <input id="bulk-description" name="description" required maxLength={500} className="field" placeholder="2026 dues" />
      </div>
      {state && "error" in state ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state && "ok" in state ? <p className="text-sm text-success">{state.message}</p> : null}
      <button type="submit" disabled={pending} className="btn-secondary">
        {pending ? "Posting…" : "Post dues"}
      </button>
    </form>
  );
}

export function TransferForm({
  orgSlug,
  funds,
  csrf,
}: {
  orgSlug: string;
  funds: { id: string; name: string }[];
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<TreasuryState, FormData>(
    postTransferAction,
    null,
  );
  return (
    <form action={action} className="card space-y-3">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="from">From</label>
          <select id="from" name="fromFundId" className="field" defaultValue="">
            <option value="" disabled>Pick…</option>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="to">To</label>
          <select id="to" name="toFundId" className="field" defaultValue="">
            <option value="" disabled>Pick…</option>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="xfer-amount">Amount ($)</label>
          <input id="xfer-amount" name="amount" required className="field" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="xfer-desc">Description</label>
        <input id="xfer-desc" name="description" required maxLength={500} className="field" />
      </div>
      {state && "error" in state ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state && "ok" in state ? <p className="text-sm text-success">{state.message}</p> : null}
      <button type="submit" disabled={pending} className="btn-secondary">
        {pending ? "Transferring…" : "Transfer"}
      </button>
    </form>
  );
}

export function ReverseButton({
  orgSlug,
  txnId,
  csrf,
}: {
  orgSlug: string;
  txnId: string;
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<TreasuryState, FormData>(
    reverseTransactionAction,
    null,
  );
  return (
    <form action={action}>
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="txnId" value={txnId} />
      <button type="submit" disabled={pending} className="text-xs text-sky hover:text-ink">
        {pending ? "Reversing…" : "Reverse"}
      </button>
      {state && "error" in state ? <p className="text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}

export function RecomputeButton({
  orgSlug,
  csrf,
}: {
  orgSlug: string;
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<TreasuryState, FormData>(
    recomputeBalancesAction,
    null,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <label className="text-sm flex items-center gap-2">
        <input type="checkbox" name="fix" /> Fix drift
      </label>
      <button type="submit" disabled={pending} className="btn-secondary">
        {pending ? "Checking…" : "Recompute balances"}
      </button>
      {state && "ok" in state ? <span className="text-xs text-slate-soft">{state.message}</span> : null}
      {state && "error" in state ? <span className="text-xs text-danger">{state.error}</span> : null}
    </form>
  );
}
