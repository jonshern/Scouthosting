"use client";

import { useActionState } from "react";
import {
  openBillingPortalAction,
  startSubscriptionAction,
  type BillingActionState,
} from "@/server-actions/billing";

function ActionButton({
  action,
  csrf,
  slug,
  label,
  pendingLabel,
  primary,
  extra,
}: {
  action: (prev: BillingActionState, fd: FormData) => Promise<BillingActionState>;
  csrf: React.ReactNode;
  slug: string;
  label: string;
  pendingLabel: string;
  primary?: boolean;
  extra?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState<BillingActionState, FormData>(action, null);
  return (
    <form action={formAction} className="space-y-2">
      {csrf}
      <input type="hidden" name="orgSlug" value={slug} />
      {Object.entries(extra ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" disabled={pending} className={primary ? "btn-primary" : "btn-secondary"}>
        {pending ? pendingLabel : label}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function SubscribeButton({
  csrf,
  slug,
  label,
  interval,
  primary,
}: {
  csrf: React.ReactNode;
  slug: string;
  label: string;
  interval: "year" | "month";
  primary?: boolean;
}) {
  return (
    <ActionButton
      action={startSubscriptionAction}
      csrf={csrf}
      slug={slug}
      label={label}
      pendingLabel="Opening Stripe…"
      primary={primary}
      extra={{ interval }}
    />
  );
}

export function ManageBillingButton({ csrf, slug }: { csrf: React.ReactNode; slug: string }) {
  return (
    <ActionButton
      action={openBillingPortalAction}
      csrf={csrf}
      slug={slug}
      label="Manage billing"
      pendingLabel="Opening Stripe…"
    />
  );
}
