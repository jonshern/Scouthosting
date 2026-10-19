"use client";

import { useActionState } from "react";
import { startMemberPayment } from "@/server-actions/pay";

export function PayBalanceForm({
  orgSlug,
  memberId,
  defaultAmount,
  defaultDescription,
  csrf,
}: {
  orgSlug: string;
  memberId: string;
  defaultAmount: string;
  defaultDescription: string;
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<{ error?: string } | null, FormData>(
    startMemberPayment,
    null,
  );
  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="memberId" value={memberId} />
      <div>
        <label className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          Amount ($)
        </label>
        <input
          name="amount"
          required
          defaultValue={defaultAmount}
          className="field w-28"
        />
      </div>
      <div className="flex-1 min-w-[180px]">
        <label className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          What for
        </label>
        <input
          name="description"
          required
          defaultValue={defaultDescription}
          maxLength={500}
          className="field"
        />
      </div>
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Redirecting…" : "Pay online"}
      </button>
      {state?.error ? <p className="w-full text-xs text-danger">{state.error}</p> : null}
    </form>
  );
}
