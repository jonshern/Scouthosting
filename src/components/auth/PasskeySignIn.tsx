"use client";

// "Sign in with a passkey" on /login, and "Use a passkey" on the
// second-step page. The server action redirects on success.

import { useState, useSyncExternalStore, useTransition } from "react";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import {
  mfaPasskeyOptions,
  mfaPasskeyVerify,
  passkeySignIn,
  passkeySignInOptions,
} from "@/server-actions/passkeys";
import { csrfToken } from "@/components/auth/csrf-client";

export function PasskeySignIn({
  csrf,
  next,
  mode,
}: {
  csrf: string;
  next?: string;
  mode: "sign-in" | "second-step";
}) {
  const supported = useWebAuthnSupport();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!supported) return null;

  const run = () =>
    start(async () => {
      const token = csrfToken(csrf);
      setError(null);
      const opts = mode === "sign-in" ? await passkeySignInOptions(token) : await mfaPasskeyOptions(token);
      if (!opts.ok) {
        setError(opts.error);
        return;
      }
      let response;
      try {
        response = await startAuthentication({ optionsJSON: opts.options });
      } catch {
        setError("No passkey was used. Try again, or sign in another way.");
        return;
      }
      const result =
        mode === "sign-in"
          ? await passkeySignIn(token, response, next ?? "")
          : await mfaPasskeyVerify(token, response, next ?? "");
      // Success redirects; we only get here on failure.
      if (result && !result.ok) setError(result.error);
    });

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={
          mode === "sign-in"
            ? "inline-flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-white px-4 py-3 text-sm font-medium text-slate-ink transition-colors hover:border-slate-ink/40"
            : "btn-primary w-full"
        }
      >
        <KeyIcon />
        {pending ? "Waiting for your passkey…" : mode === "sign-in" ? "Sign in with a passkey" : "Use a passkey"}
      </button>
      {error && (
        <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

function KeyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.85 12.15 19 4M17 6l2 2M14.5 8.5l2 2" strokeLinecap="round" />
    </svg>
  );
}

const noSubscribe = () => () => {};

/** False during server rendering, then whether this browser has WebAuthn. */
export function useWebAuthnSupport(): boolean {
  return useSyncExternalStore(noSubscribe, browserSupportsWebAuthn, () => false);
}
