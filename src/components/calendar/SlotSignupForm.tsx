"use client";

import { useActionState } from "react";
import { takeSlot, type SlotActionState } from "@/server-actions/slots";

type Props = {
  orgSlug: string;
  slotId: string;
  signedIn: boolean;
  csrf: React.ReactNode;
  full: boolean;
  allowWaitlist: boolean;
};

export function SlotSignupForm({ orgSlug, slotId, signedIn, csrf, full, allowWaitlist }: Props) {
  const [state, formAction, pending] = useActionState<SlotActionState, FormData>(
    async (prev, fd) => takeSlot(prev, fd),
    null,
  );

  if (full && !allowWaitlist) {
    return <p className="mt-2 text-xs text-ink-muted">This slot is full.</p>;
  }

  const submitLabel = full
    ? pending
      ? "Joining waitlist…"
      : "Join waitlist"
    : pending
    ? "Signing up…"
    : "Sign up";

  return (
    <form action={formAction} className="mt-2 space-y-2 text-sm">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="slotId" value={slotId} />

      {!signedIn && (
        <>
          <label className="block">
            <span className="block text-xs text-ink-muted">Your name</span>
            <input name="name" required className="input" />
          </label>
          <label className="block">
            <span className="block text-xs text-ink-muted">Email</span>
            <input name="email" type="email" required className="input" />
          </label>
        </>
      )}

      <label className="block">
        <span className="block text-xs text-ink-muted">Notes (optional)</span>
        <input name="notes" maxLength={200} className="input" />
      </label>

      <button type="submit" disabled={pending} className="btn-primary text-xs">
        {submitLabel}
      </button>

      {state?.error && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
      {state?.ok && state.waitlisted && (
        <p className="text-xs text-amber-700">Added to the waitlist — we'll auto-promote when a spot opens.</p>
      )}
      {state?.ok && !state.waitlisted && (
        <p className="text-xs text-emerald-700">Signed up — thanks!</p>
      )}
    </form>
  );
}
