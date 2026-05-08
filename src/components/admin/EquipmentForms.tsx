"use client";

import { useActionState } from "react";
import {
  upsertEquipment,
  loanEquipment,
  returnEquipment,
  type EquipmentState,
} from "@/server-actions/equipment";

export function EquipmentItemForm({
  orgSlug,
  csrf,
}: {
  orgSlug: string;
  csrf: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<EquipmentState, FormData>(upsertEquipment, null);
  return (
    <form action={formAction} className="card space-y-4">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" required maxLength={120} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="category">Category</label>
          <input id="category" name="category" maxLength={60} className="field" placeholder="Patrol box, Cooking, Shelter…" />
        </div>
        <div>
          <label className="label" htmlFor="serialOrTag">Serial / asset tag</label>
          <input id="serialOrTag" name="serialOrTag" maxLength={60} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="location">Location</label>
          <input id="location" name="location" maxLength={120} className="field" placeholder="Trailer, Storage closet…" />
        </div>
        <div>
          <label className="label" htmlFor="condition">Condition</label>
          <select id="condition" name="condition" className="field" defaultValue="good">
            <option value="good">Good</option>
            <option value="fair">Fair</option>
            <option value="needs-repair">Needs repair</option>
            <option value="retired">Retired</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="quantity">Quantity</label>
          <input id="quantity" name="quantity" type="number" min={1} defaultValue={1} className="field" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={2} maxLength={2000} className="field" />
      </div>
      {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : "Add equipment"}
      </button>
    </form>
  );
}

export function LoanForm({
  orgSlug,
  equipmentId,
  members,
  csrf,
}: {
  orgSlug: string;
  equipmentId: string;
  members: { id: string; name: string }[];
  csrf: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<EquipmentState, FormData>(loanEquipment, null);
  return (
    <form action={formAction} className="space-y-2">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="equipmentId" value={equipmentId} />
      <div className="grid gap-2 md:grid-cols-3">
        <select name="memberId" required className="field" defaultValue="">
          <option value="" disabled>Borrower…</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <input name="dueAt" type="date" className="field" />
        <input name="loanNotes" maxLength={2000} className="field" placeholder="Notes (optional)" />
      </div>
      {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="btn-secondary">
        {pending ? "Loaning…" : "Loan out"}
      </button>
    </form>
  );
}

export function ReturnForm({
  orgSlug,
  loanId,
  csrf,
}: {
  orgSlug: string;
  loanId: string;
  csrf: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<EquipmentState, FormData>(returnEquipment, null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="loanId" value={loanId} />
      <input
        name="returnNotes"
        maxLength={2000}
        placeholder="Condition / damage / missing pieces"
        className="field flex-1 min-w-[200px]"
      />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Returning…" : "Mark returned"}
      </button>
      {state?.error ? <p className="w-full text-sm text-danger">{state.error}</p> : null}
    </form>
  );
}
