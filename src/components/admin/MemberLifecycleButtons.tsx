"use client";

import { useActionState } from "react";
import { restoreMember, softDeleteMember } from "@/server-actions/members";

type State = { error?: string; ok?: true } | null;

export function MemberLifecycleButtons({
  orgSlug,
  memberId,
  isDeleted,
  csrf,
}: {
  orgSlug: string;
  memberId: string;
  isDeleted: boolean;
  csrf: React.ReactNode;
}) {
  const action = isDeleted ? restoreMember : softDeleteMember;
  const [state, formAction, pending] = useActionState<State, FormData>(action, null);
  return (
    <form action={formAction} className="card flex items-center justify-between gap-4">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="id" value={memberId} />
      <p className="text-sm text-ink-muted">
        {isDeleted
          ? "Restoring re-adds them to the active roster."
          : "Soft-deletes the member. Their attribution on photos / posts is preserved. Permanent purge after 30 days."}
      </p>
      <div className="flex flex-col items-end gap-1">
        <button type="submit" disabled={pending} className={isDeleted ? "btn-primary" : "btn-secondary"}>
          {pending ? "Saving…" : isDeleted ? "Restore" : "Remove"}
        </button>
        {state?.error && <span className="text-xs text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
