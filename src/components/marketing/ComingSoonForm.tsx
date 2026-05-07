"use client";

import { useActionState } from "react";
import { submitInviteCode, type InviteState } from "@/server-actions/invite";

export function ComingSoonForm() {
  const [state, formAction, pending] = useActionState<InviteState, FormData>(
    submitInviteCode,
    null,
  );
  return (
    <form action={formAction} className="card space-y-3 text-left">
      <label htmlFor="code" className="label text-xs uppercase tracking-[0.14em]">
        Enter your invite code
      </label>
      <input
        id="code"
        name="code"
        required
        autoFocus
        autoComplete="off"
        spellCheck={false}
        placeholder="EAGLE-1234-EXPLORE"
        className="field font-mono text-center text-base tracking-wider"
      />
      {state?.error && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {state.error}
        </div>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Checking…" : "Unlock"}
      </button>
    </form>
  );
}
