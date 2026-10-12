"use client";

import { useActionState } from "react";
import { completeMfaLoginAction, type ActionState } from "@/server-actions/auth";

export function MfaLoginForm({ csrf, next }: { csrf: React.ReactNode; next?: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    completeMfaLoginAction,
    null,
  );
  return (
    <form action={formAction} className="space-y-4" noValidate>
      {csrf}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <label className="label" htmlFor="code">
          Code
        </label>
        <input
          id="code"
          name="code"
          required
          inputMode="text"
          autoComplete="one-time-code"
          maxLength={20}
          className="field"
          placeholder="6-digit code or backup code"
        />
      </div>
      {state?.error && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
          {state.error}
        </div>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Verifying…" : "Verify and sign in"}
      </button>
    </form>
  );
}
