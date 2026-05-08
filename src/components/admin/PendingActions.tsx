"use client";

import { useActionState } from "react";
import {
  approvePending,
  declinePending,
  type PendingState,
} from "@/server-actions/pending";

export function ApproveButton({
  orgSlug,
  memberId,
  csrf,
}: {
  orgSlug: string;
  memberId: string;
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<PendingState, FormData>(approvePending, null);
  return (
    <form action={action} className="inline">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="memberId" value={memberId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-success hover:text-ink"
      >
        {pending ? "…" : "Approve"}
      </button>
      {state && "error" in state ? (
        <span className="text-xs text-danger ml-2">{state.error}</span>
      ) : null}
    </form>
  );
}

export function DeclineButton({
  orgSlug,
  memberId,
  csrf,
}: {
  orgSlug: string;
  memberId: string;
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<PendingState, FormData>(declinePending, null);
  return (
    <form action={action} className="inline">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="memberId" value={memberId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-danger hover:text-ink"
      >
        {pending ? "…" : "Decline"}
      </button>
      {state && "error" in state ? (
        <span className="text-xs text-danger ml-2">{state.error}</span>
      ) : null}
    </form>
  );
}
