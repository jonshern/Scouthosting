"use client";

import { useActionState } from "react";
import {
  saveTreasuryStripeKey,
  clearTreasuryStripeKey,
  type StripeSettingsState,
} from "@/server-actions/treasury-stripe";

export function StripeKeyForm({
  orgSlug,
  csrf,
  currentPrefix,
  currentLabel,
}: {
  orgSlug: string;
  csrf: React.ReactNode;
  currentPrefix: string | null;
  currentLabel: string | null;
}) {
  const [state, action, pending] = useActionState<StripeSettingsState, FormData>(
    saveTreasuryStripeKey,
    null,
  );
  return (
    <form action={action} className="card space-y-3">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      {currentPrefix ? (
        <p className="text-sm text-slate-soft">
          Current key: <code className="font-mono">{currentPrefix}…</code>
          {currentLabel ? <> · {currentLabel}</> : null}
        </p>
      ) : (
        <p className="text-sm text-slate-muted">No key on file.</p>
      )}
      <div>
        <label className="label" htmlFor="apiKey">Stripe restricted secret key</label>
        <input
          id="apiKey"
          name="apiKey"
          required
          className="field font-mono text-xs"
          placeholder="rk_live_… or sk_test_…"
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-slate-muted">
          Use a <strong>restricted</strong> key with Checkout sessions write
          and PaymentIntents read. We never log this value.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="webhookSecret">Webhook signing secret (optional)</label>
        <input
          id="webhookSecret"
          name="webhookSecret"
          className="field font-mono text-xs"
          placeholder="whsec_…"
          autoComplete="off"
        />
      </div>
      <div>
        <label className="label" htmlFor="accountLabel">Friendly label</label>
        <input
          id="accountLabel"
          name="accountLabel"
          className="field"
          placeholder="Troop 100 checking"
        />
      </div>
      {state && "error" in state ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state && "ok" in state ? <p className="text-sm text-success">{state.message}</p> : null}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Saving…" : "Save Stripe key"}
      </button>
    </form>
  );
}

export function ClearStripeKeyButton({
  orgSlug,
  csrf,
}: {
  orgSlug: string;
  csrf: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<StripeSettingsState, FormData>(
    clearTreasuryStripeKey,
    null,
  );
  return (
    <form action={action} className="space-y-2">
      {csrf}
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <button type="submit" disabled={pending} className="btn-secondary">
        {pending ? "Clearing…" : "Disconnect Stripe"}
      </button>
      {state && "error" in state ? <p className="text-sm text-danger">{state.error}</p> : null}
    </form>
  );
}
