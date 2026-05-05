"use client";

import { useActionState, useState, useTransition } from "react";
import {
  enrollMfa,
  confirmMfa,
  disableMfa,
  regenerateBackupCodes,
  type MfaState,
} from "@/server-actions/mfa";

type EnrollPayload = {
  secret: string;
  uri: string;
  backupCodes: string[];
};

export function MfaSettings({
  enrolled,
  csrf,
}: {
  enrolled: boolean;
  csrf: React.ReactNode;
}) {
  const [enrollment, setEnrollment] = useState<EnrollPayload | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrollPending, startEnroll] = useTransition();

  const [confirmState, confirmAction, confirmPending] = useActionState<MfaState, FormData>(
    confirmMfa,
    null,
  );
  const [disableState, disableAction, disablePending] = useActionState<MfaState, FormData>(
    disableMfa,
    null,
  );

  const [regenCodes, setRegenCodes] = useState<string[] | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [regenPending, startRegen] = useTransition();

  function onEnrollSubmit(form: FormData) {
    setEnrollError(null);
    startEnroll(async () => {
      const result = await enrollMfa(form);
      if (result.ok) {
        setEnrollment({
          secret: result.secret,
          uri: result.uri,
          backupCodes: result.backupCodes,
        });
      } else {
        setEnrollError(result.error);
      }
    });
  }

  function onRegenSubmit(form: FormData) {
    setRegenError(null);
    setRegenCodes(null);
    startRegen(async () => {
      const result = await regenerateBackupCodes(form);
      if (result.ok) {
        setRegenCodes(result.backupCodes);
      } else {
        setRegenError(result.error);
      }
    });
  }

  if (!enrolled && !enrollment) {
    return (
      <section className="card space-y-4">
        <header>
          <h2 className="text-xl font-semibold">Two-factor authentication</h2>
          <p className="text-sm text-ink-muted">
            Add a one-time code from an authenticator app to every sign-in.
          </p>
        </header>
        <form action={onEnrollSubmit} className="space-y-3">
          {csrf}
          {enrollError && (
            <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
              {enrollError}
            </div>
          )}
          <button type="submit" disabled={enrollPending} className="btn-primary">
            {enrollPending ? "Generating…" : "Set up 2FA"}
          </button>
        </form>
      </section>
    );
  }

  if (!enrolled && enrollment) {
    return (
      <section className="card space-y-6">
        <header>
          <h2 className="text-xl font-semibold">Finish setting up 2FA</h2>
          <p className="text-sm text-ink-muted">
            Add this account to your authenticator app, save your backup codes, then enter a code to confirm.
          </p>
        </header>
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Authenticator URI</h3>
          <code className="block break-all text-xs bg-zinc-50 border rounded p-3">{enrollment.uri}</code>
          <p className="text-xs text-ink-muted">Manual secret: <code className="font-mono">{enrollment.secret}</code></p>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Backup codes — save these now</h3>
          <ul className="grid grid-cols-2 gap-2 text-sm font-mono bg-zinc-50 border rounded p-3">
            {enrollment.backupCodes.map((c) => (<li key={c}>{c}</li>))}
          </ul>
        </div>
        <form action={confirmAction} className="space-y-3">
          {csrf}
          <div>
            <label className="label" htmlFor="confirm-code">Code from your authenticator</label>
            <input id="confirm-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" required maxLength={6} className="field" />
          </div>
          {confirmState?.error && (
            <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{confirmState.error}</div>
          )}
          {confirmState?.ok && (
            <div role="status" className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">2FA enabled. Reload to see your settings.</div>
          )}
          <button type="submit" disabled={confirmPending} className="btn-primary">{confirmPending ? "Confirming…" : "Confirm and enable 2FA"}</button>
        </form>
      </section>
    );
  }

  return (
    <section className="card space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Two-factor authentication</h2>
        <p className="text-sm text-ink-muted">2FA is enabled on your account.</p>
      </header>
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Regenerate backup codes</h3>
        <form action={onRegenSubmit} className="space-y-3">
          {csrf}
          <div>
            <label className="label" htmlFor="regen-code">Code</label>
            <input id="regen-code" name="code" inputMode="text" autoComplete="one-time-code" required maxLength={20} className="field" />
          </div>
          {regenError && (<div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{regenError}</div>)}
          {regenCodes && (
            <div className="space-y-2">
              <p className="text-xs text-ink-muted">Save these now — they will not be shown again.</p>
              <ul className="grid grid-cols-2 gap-2 text-sm font-mono bg-zinc-50 border rounded p-3">
                {regenCodes.map((c) => (<li key={c}>{c}</li>))}
              </ul>
            </div>
          )}
          <button type="submit" disabled={regenPending} className="btn-secondary">{regenPending ? "Regenerating…" : "Regenerate backup codes"}</button>
        </form>
      </div>
      <hr />
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Disable 2FA</h3>
        <form action={disableAction} className="space-y-3">
          {csrf}
          <div>
            <label className="label" htmlFor="disable-code">Code</label>
            <input id="disable-code" name="code" inputMode="text" autoComplete="one-time-code" required maxLength={20} className="field" />
          </div>
          {disableState?.error && (<div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{disableState.error}</div>)}
          {disableState?.ok && (<div role="status" className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">2FA disabled. Reload to see your settings.</div>)}
          <button type="submit" disabled={disablePending} className="btn-secondary">{disablePending ? "Disabling…" : "Disable 2FA"}</button>
        </form>
      </div>
    </section>
  );
}
