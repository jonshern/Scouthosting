"use client";

import { useActionState } from "react";
import { signupAction, type ActionState } from "@/server-actions/auth";

export function SignupForm({ csrf, next }: { csrf: React.ReactNode; next?: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(signupAction, null);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      {csrf}
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label className="label" htmlFor="displayName">Your name</label>
        <input id="displayName" name="displayName" required className="field" autoComplete="name" />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required className="field" autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          className="field"
          autoComplete="new-password"
        />
        <p className="mt-1 text-xs text-ink-muted">At least 12 characters.</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="adult" value="yes" required className="mt-1" />
        <span>I confirm I am 18 or older. Scouts join through a parent or guardian&apos;s account.</span>
      </label>
      {state?.error && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
          {state.error}
        </div>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
