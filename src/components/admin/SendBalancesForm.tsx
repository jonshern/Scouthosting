"use client";

import { useActionState } from "react";
import { sendAllBalances, type SendBalancesState } from "@/server-actions/treasury-balances";

export function SendBalancesForm({
  orgSlug,
  csrf,
}: {
  orgSlug: string;
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<SendBalancesState, FormData>(
    sendAllBalances,
    null,
  );
  return (
    <form action={action} className="space-y-3">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Sending…" : "Send balances now"}
      </button>
      {state && "error" in state ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state && "ok" in state ? (
        <div className="rounded-md border border-success/30 bg-success-soft p-3 text-sm text-slate-soft">
          Sent {state.emailsSent} email{state.emailsSent === 1 ? "" : "s"} covering{" "}
          {state.membersCovered} member{state.membersCovered === 1 ? "" : "s"}.
          {state.skipped.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-xs">
              {state.skipped.map((s, i) => (
                <li key={i}><strong>{s.name}</strong>: {s.reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
