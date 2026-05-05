"use client";

import { useActionState } from "react";
import { submitRsvp } from "@/server-actions/rsvp";

type Props = {
  orgSlug: string;
  eventId: string;
  signedIn: boolean;
  csrf: React.ReactNode;
};

type State = { error?: string; ok?: true } | null;

export function RsvpForm({ orgSlug, eventId, signedIn, csrf }: Props) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    async (prev, fd) => submitRsvp(prev, fd),
    null,
  );

  return (
    <form action={formAction} className="mt-3 space-y-2 text-sm">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="eventId" value={eventId} />

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

      <div className="flex flex-wrap items-center gap-2">
        <label className="block">
          <span className="sr-only">Response</span>
          <select name="response" defaultValue="yes" className="input">
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="maybe">Maybe</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-xs text-ink-muted">Guests</span>
          <input
            name="guests"
            type="number"
            min={0}
            defaultValue={0}
            className="input w-16"
          />
        </label>
      </div>

      <label className="block">
        <span className="block text-xs text-ink-muted">Notes (optional)</span>
        <textarea name="notes" rows={2} className="input" />
      </label>

      <button type="submit" disabled={pending} className="btn-primary text-xs">
        {pending ? "Submitting…" : "Submit RSVP"}
      </button>

      {state?.error && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="text-xs text-emerald-700">Thanks — your RSVP was recorded.</p>
      )}
    </form>
  );
}
