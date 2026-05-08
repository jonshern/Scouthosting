"use client";

import { useActionState } from "react";
import {
  upsertFiscalYear,
  upsertBudget,
  type FyState,
} from "@/server-actions/treasury-fy";

export function FiscalYearForm({
  orgSlug,
  initial,
  csrf,
}: {
  orgSlug: string;
  initial?: { id?: string; label?: string; startsOn?: Date; endsOn?: Date; closed?: boolean };
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<FyState, FormData>(upsertFiscalYear, null);
  const fy = initial ?? {};
  const toDate = (d?: Date) =>
    d ? new Date(d).toISOString().slice(0, 10) : "";
  return (
    <form action={action} className="card space-y-3">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {fy.id ? <input type="hidden" name="id" value={fy.id} /> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-3">
          <label className="label" htmlFor="label">Label</label>
          <input
            id="label"
            name="label"
            required
            maxLength={40}
            placeholder="FY 2026"
            defaultValue={fy.label ?? ""}
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="startsOn">Starts on</label>
          <input
            id="startsOn"
            name="startsOn"
            type="date"
            required
            defaultValue={toDate(fy.startsOn)}
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="endsOn">Ends on</label>
          <input
            id="endsOn"
            name="endsOn"
            type="date"
            required
            defaultValue={toDate(fy.endsOn)}
            className="field"
          />
        </div>
        <label className="flex items-center gap-2 text-sm md:col-span-3">
          <input type="checkbox" name="closed" defaultChecked={!!fy.closed} />{" "}
          Closed (locks budgets, hides from year-picker)
        </label>
      </div>
      {state && "error" in state ? <p className="text-sm text-danger">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : fy.id ? "Save fiscal year" : "Create fiscal year"}
      </button>
    </form>
  );
}

export function BudgetForm({
  orgSlug,
  fiscalYearId,
  funds,
  existing,
  csrf,
}: {
  orgSlug: string;
  fiscalYearId: string;
  funds: { id: string; name: string }[];
  existing: Map<string, { expectedCents: number; notes: string | null }>;
  csrf: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {funds.map((f) => {
        const cur = existing.get(f.id);
        return (
          <SingleBudgetRow
            key={f.id}
            orgSlug={orgSlug}
            fiscalYearId={fiscalYearId}
            fund={f}
            initialExpected={cur ? (cur.expectedCents / 100).toFixed(2) : ""}
            initialNotes={cur?.notes ?? ""}
            csrf={csrf}
          />
        );
      })}
    </div>
  );
}

function SingleBudgetRow({
  orgSlug,
  fiscalYearId,
  fund,
  initialExpected,
  initialNotes,
  csrf,
}: {
  orgSlug: string;
  fiscalYearId: string;
  fund: { id: string; name: string };
  initialExpected: string;
  initialNotes: string;
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<FyState, FormData>(upsertBudget, null);
  return (
    <form action={action} className="grid gap-2 md:grid-cols-[1.2fr_0.8fr_2fr_auto] items-end rounded-md border border-line bg-surface p-3">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="fiscalYearId" value={fiscalYearId} />
      <input type="hidden" name="fundId" value={fund.id} />
      <div>
        <label className="label">Fund</label>
        <div className="text-sm font-medium text-ink">{fund.name}</div>
      </div>
      <div>
        <label className="label" htmlFor={`exp-${fund.id}`}>Expected ($)</label>
        <input
          id={`exp-${fund.id}`}
          name="expected"
          required
          defaultValue={initialExpected}
          className="field"
          placeholder="0.00"
        />
      </div>
      <div>
        <label className="label" htmlFor={`notes-${fund.id}`}>Notes</label>
        <input
          id={`notes-${fund.id}`}
          name="notes"
          maxLength={500}
          defaultValue={initialNotes}
          className="field"
        />
      </div>
      <div>
        <button type="submit" disabled={pending} className="btn-secondary">
          {pending ? "…" : "Save"}
        </button>
      </div>
      {state && "error" in state ? (
        <p className="md:col-span-4 text-sm text-danger">{state.error}</p>
      ) : null}
      {state && "ok" in state ? (
        <p className="md:col-span-4 text-xs text-success">Saved.</p>
      ) : null}
    </form>
  );
}
