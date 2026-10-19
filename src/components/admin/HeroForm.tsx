"use client";

import { useActionState } from "react";
import { saveHero } from "@/server-actions/pages";

type State = { error?: string; ok?: true } | null;

export function HeroForm({
  orgSlug,
  initial,
  csrf,
}: {
  orgSlug: string;
  initial?: { heroHeadline?: string | null; heroLede?: string | null };
  csrf: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(saveHero, null);
  return (
    <form action={formAction} className="card space-y-4">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <div>
        <label className="label" htmlFor="heroHeadline">Headline</label>
        <input
          id="heroHeadline"
          name="heroHeadline"
          maxLength={200}
          defaultValue={initial?.heroHeadline ?? ""}
          className="field"
        />
      </div>
      <div>
        <label className="label" htmlFor="heroLede">Subhead</label>
        <textarea
          id="heroLede"
          name="heroLede"
          rows={3}
          maxLength={2000}
          defaultValue={initial?.heroLede ?? ""}
          className="field"
        />
      </div>
      {state?.error && (
        <div role="alert" className="text-sm text-danger bg-danger-soft border border-danger-line rounded p-3">{state.error}</div>
      )}
      {state?.ok && (
        <div role="status" className="text-sm text-done-text bg-done-soft border border-done/30 rounded p-3">Saved.</div>
      )}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : "Save hero"}
      </button>
    </form>
  );
}
