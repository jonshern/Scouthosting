// Apex coming-soon invite-code form. Visuals lean on the
// design-handoff/coming-soon.jsx treatment — large mono text input
// styled like a one-time code, anchored on the white card next to the
// dark hero. Falls back gracefully when the action errors.

"use client";

import { useActionState } from "react";
import { submitInviteCode, type InviteState } from "@/server-actions/invite";

export function ComingSoonForm() {
  const [state, formAction, pending] = useActionState<InviteState, FormData>(
    submitInviteCode,
    null,
  );
  return (
    <form action={formAction} className="space-y-4">
      <label htmlFor="code" className="sr-only">
        Invite code
      </label>
      <input
        id="code"
        name="code"
        required
        autoFocus
        autoComplete="off"
        spellCheck={false}
        placeholder="EAGLE-EXPLORE-2026"
        className="block w-full rounded-lg border-[1.5px] border-line bg-white px-4 py-3.5 text-center font-mono text-lg uppercase tracking-[0.14em] text-slate-ink placeholder:text-slate-muted/60 focus:border-slate-ink focus:outline-none focus:ring-2 focus:ring-sky/30"
      />
      <p className="text-xs text-slate-muted">
        Case-insensitive · case doesn&apos;t matter
      </p>

      {state?.error && (
        <div
          role="alert"
          className="rounded-md border border-danger-line bg-danger-soft p-2 text-sm text-danger"
        >
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-slate-ink px-4 py-3.5 text-sm font-medium text-white transition-colors hover:bg-sky disabled:opacity-50"
      >
        {pending ? "Checking…" : "Unlock my troop"}
      </button>
    </form>
  );
}
