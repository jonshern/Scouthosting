"use client";

import { useActionState } from "react";
import { sendBroadcast, type BroadcastState } from "@/server-actions/email";

export function EmailComposer({
  orgSlug,
  patrols,
  csrf,
}: {
  orgSlug: string;
  patrols: string[];
  csrf: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<BroadcastState, FormData>(sendBroadcast, null);
  return (
    <form action={formAction} className="card space-y-4">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />

      <div>
        <label className="label" htmlFor="subject">Subject</label>
        <input id="subject" name="subject" required maxLength={200} className="field" />
      </div>

      <div>
        <label className="label" htmlFor="body">Body</label>
        <textarea
          id="body"
          name="body"
          rows={12}
          required
          maxLength={50_000}
          className="field font-mono text-sm"
        />
        <p className="mt-1 text-xs text-ink-muted">
          Plain text with paragraph breaks. URLs auto-link. HTML escapes.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="audienceKind">Audience</label>
          <select id="audienceKind" name="audienceKind" defaultValue="everyone" className="field">
            <option value="everyone">Everyone</option>
            <option value="adults">Adults only</option>
            <option value="youth">Youth only</option>
            <option value="leaders">Leaders (anyone with a position)</option>
            <option value="patrol">Single patrol</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="audiencePatrol">Patrol</label>
          <select id="audiencePatrol" name="audiencePatrol" defaultValue="" className="field">
            <option value="">— pick one —</option>
            {patrols.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-muted">Used only when audience is &ldquo;Single patrol&rdquo;.</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input id="dryRun" name="dryRun" type="checkbox" />
        <label htmlFor="dryRun">Dry run — count recipients without sending</label>
      </div>

      {state && "error" in state && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
          {state.error}
        </div>
      )}
      {state && "ok" in state && (
        <div role="status" className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">
          {state.dryRun
            ? `Would send to ${state.recipientCount} recipient${state.recipientCount === 1 ? "" : "s"}.`
            : state.status === "queued"
              ? `Sending to ${state.recipientCount} recipient${state.recipientCount === 1 ? "" : "s"}. Progress shows in the email history.`
              : `Sent to ${state.deliveredCount}/${state.recipientCount}` +
              (state.failedCount > 0 ? ` (${state.failedCount} failed)` : "") + "."}
        </div>
      )}

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Sending…" : "Send broadcast"}
      </button>
    </form>
  );
}
