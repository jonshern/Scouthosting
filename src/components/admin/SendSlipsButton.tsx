"use client";

import { useActionState } from "react";
import {
  sendPermissionSlips,
  type SlipDispatchState,
} from "@/server-actions/permission-slips";

export function SendSlipsButton({
  orgSlug,
  eventId,
  csrf,
}: {
  orgSlug: string;
  eventId: string;
  csrf: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<SlipDispatchState, FormData>(
    sendPermissionSlips,
    null,
  );
  return (
    <form action={formAction} className="space-y-3">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="eventId" value={eventId} />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Sending…" : "Send slips to parents"}
      </button>
      {state && "error" in state ? (
        <p className="text-sm text-danger">{state.error}</p>
      ) : null}
      {state && "ok" in state ? (
        <div className="rounded-md border border-success/30 bg-success-soft p-3 text-sm text-slate-soft">
          Sent {state.emailsSent} email{state.emailsSent === 1 ? "" : "s"} for{" "}
          {state.scoutsCovered} scout{state.scoutsCovered === 1 ? "" : "s"}.
          {state.skipped.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-xs">
              {state.skipped.map((s, i) => (
                <li key={i}>
                  <strong>{s.name}</strong>: {s.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
