"use client";

import Link from "next/link";
import { useActionState } from "react";
import { startTrialAction, type StartTrialState } from "@/server-actions/start-trial";
import { TRIAL_DAYS } from "@/lib/billing/trial";

const UNIT_OPTIONS: Array<[value: string, label: string]> = [
  ["Troop", "Scouts BSA troop"],
  ["Pack", "Cub Scout pack"],
  ["Crew", "Venturing crew"],
  ["Ship", "Sea Scout ship"],
  ["Post", "Exploring post"],
  ["GirlScoutTroop", "Girl Scout troop"],
];

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function StartTrialForm({ csrf }: { csrf: React.ReactNode }) {
  const [state, formAction, pending] = useActionState<StartTrialState, FormData>(startTrialAction, null);

  if (state && "done" in state) {
    const d = state.done;
    return (
      <div className="space-y-5" data-testid="start-trial-done">
        <h2 className="font-display text-3xl font-semibold tracking-[-0.015em]">
          {d.displayName} is set up.
        </h2>
        <p className="text-sm text-slate-soft">
          Your free trial runs until <strong className="text-ink">{formatDate(d.trialEndsAt)}</strong>.
          No card needed until then. Add one from Billing whenever you&apos;re ready and you
          won&apos;t be charged before the trial ends.
        </p>
        <div className="rounded-lg border border-amber/60 bg-amber/5 p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-muted">
            Recovery code, shown once
          </div>
          <p className="mt-2 break-all font-mono text-base text-ink" data-testid="recovery-code">
            {d.recoveryCode}
          </p>
          <p className="mt-2 text-xs text-slate-soft">
            Save this somewhere safe with your unit passphrase. Together they unlock your
            roster if our server key ever has to change. We can&apos;t show it again.
          </p>
        </div>
        <Link href={`/o/${d.slug}/admin`} className="btn-primary w-full justify-center">
          Go to your unit →
        </Link>
        <p className="text-xs text-slate-muted">
          Next we&apos;ll ask you to turn on two-step sign-in, which every unit admin needs.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {csrf}
      <div className="grid gap-4 sm:grid-cols-[1.3fr_1fr]">
        <div>
          <label className="label" htmlFor="unitType">Unit type</label>
          <select id="unitType" name="unitType" required className="field" defaultValue="Troop">
            {UNIT_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="unitNumber">Number</label>
          <input id="unitNumber" name="unitNumber" required className="field" inputMode="numeric" placeholder="100" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="charterOrg">Chartered organization</label>
        <input id="charterOrg" name="charterOrg" required className="field" placeholder="First Lutheran Church" />
      </div>
      <div className="grid gap-4 sm:grid-cols-[1.6fr_1fr]">
        <div>
          <label className="label" htmlFor="city">City</label>
          <input id="city" name="city" required className="field" autoComplete="address-level2" />
        </div>
        <div>
          <label className="label" htmlFor="state">State</label>
          <input id="state" name="state" required className="field" autoComplete="address-level1" placeholder="MN" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="passphrase">Unit passphrase</label>
        <input
          id="passphrase"
          name="passphrase"
          type="password"
          required
          minLength={12}
          className="field"
          autoComplete="new-password"
        />
        <p className="mt-1 text-xs text-ink-muted">
          At least 12 characters. Your roster is encrypted, and this passphrase is your key to
          it. Keep it with the recovery code we show next.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="passphraseConfirm">Passphrase again</label>
        <input
          id="passphraseConfirm"
          name="passphraseConfirm"
          type="password"
          required
          className="field"
          autoComplete="new-password"
        />
      </div>
      {state && "error" in state && (
        <div role="alert" className="text-sm text-danger bg-danger-soft border border-danger-line rounded p-3">
          {state.error}
        </div>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Setting up your unit…" : `Start my ${TRIAL_DAYS}-day free trial`}
      </button>
      <p className="text-xs text-slate-muted">No card needed. Cancel any time.</p>
    </form>
  );
}
