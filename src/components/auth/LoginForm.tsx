"use client";

import { useActionState } from "react";
import { loginAction, type ActionState } from "@/server-actions/auth";

export function LoginForm({
  csrf,
  next,
}: {
  csrf: React.ReactNode;
  next?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(loginAction, null);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      {csrf}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required className="field" autoComplete="username webauthn" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required className="field" autoComplete="current-password" />
      </div>
      {state?.error && (
        <div role="alert" className="text-sm text-danger bg-danger-soft border border-danger-line rounded p-3">
          {state.error}
        </div>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
