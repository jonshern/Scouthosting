"use client";

// "Continue with a passkey" on /login, and "Use a passkey" on the
// second-step page. The server action redirects on success.
//
// On /login, PasswordSignIn below also starts a passkey request in the
// background when the email field is shown, so browsers that support it
// offer the saved passkeys right in the field's autofill list.

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
} from "@simplewebauthn/browser";
import { LoginForm } from "@/components/auth/LoginForm";
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
        className="btn-primary inline-flex w-full items-center justify-center gap-3 py-3"
      >
        <KeyIcon />
        {pending ? "Waiting for your passkey…" : mode === "sign-in" ? "Continue with a passkey" : "Use a passkey"}
      </button>
      {error && (
        <div role="alert" className="rounded border border-danger-line bg-danger-soft p-3 text-sm text-danger">
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

/**
 * Email and password sign-in, folded behind a small link when the browser
 * has passkeys and open when it doesn't. Opening it starts the passkey
 * autofill request for the email field.
 */
export function PasswordSignIn({
  csrf,
  csrfInput,
  next,
  startOpen = false,
}: {
  csrf: string;
  csrfInput: React.ReactNode;
  next?: string;
  startOpen?: boolean;
}) {
  // Assume passkeys during server rendering so the form starts folded;
  // a browser without them unfolds it once it hydrates.
  const supported = useSyncExternalStore(noSubscribe, browserSupportsWebAuthn, () => true);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const open = startOpen || !supported;

  const startAutofill = async () => {
    if (started.current || !(await browserSupportsWebAuthnAutofill())) return;
    started.current = true;
    const token = csrfToken(csrf);
    const opts = await passkeySignInOptions(token);
    if (!opts.ok) return;
    let response;
    try {
      response = await startAuthentication({ optionsJSON: opts.options, useBrowserAutofill: true });
    } catch {
      // Cancelled, or replaced by the passkey button's own request.
      started.current = false;
      return;
    }
    const result = await passkeySignIn(token, response, next ?? "");
    if (result && !result.ok) setError(result.error);
  };

  useEffect(() => {
    if (open) void startAutofill();
    // startAutofill only reads props that don't change on this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <details
      id="password-sign-in"
      open={open}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) void startAutofill();
      }}
      className="group"
    >
      <summary className="cursor-pointer list-none text-center text-sm text-slate-muted underline-offset-2 hover:text-slate-ink hover:underline group-open:hidden">
        Use email and password instead
      </summary>
      <div className="mt-2 space-y-4">
        {error && (
          <div role="alert" className="rounded border border-danger-line bg-danger-soft p-3 text-sm text-danger">
            {error}
          </div>
        )}
        <LoginForm csrf={csrfInput} next={next} />
      </div>
    </details>
  );
}
