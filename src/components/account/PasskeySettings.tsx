"use client";

// Add a passkey from /account/security. The list and the Remove buttons
// are rendered by the page (server component).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { useWebAuthnSupport } from "@/components/auth/PasskeySignIn";
import { passkeyRegister, passkeyRegistrationOptions } from "@/server-actions/passkeys";
import { csrfToken } from "@/components/auth/csrf-client";

function guessDeviceName(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "Passkey";
}

export function AddPasskey({
  csrf,
  continueTo,
  label = "Add a passkey",
}: {
  csrf: string;
  /** After adding, go here instead of refreshing the list (the post-sign-up prompt). */
  continueTo?: string;
  label?: string;
}) {
  const router = useRouter();
  const supported = useWebAuthnSupport();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [pending, start] = useTransition();

  if (!supported) {
    return <p className="text-sm text-ink-muted">This browser can&apos;t make passkeys.</p>;
  }

  const add = () =>
    start(async () => {
      const token = csrfToken(csrf);
      setError(null);
      setAdded(false);
      const opts = await passkeyRegistrationOptions(token);
      if (!opts.ok) {
        setError(opts.error);
        return;
      }
      let response;
      try {
        response = await startRegistration({ optionsJSON: opts.options });
      } catch {
        setError("No passkey was made. Try again.");
        return;
      }
      const result = await passkeyRegister(token, response, name.trim() || guessDeviceName());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (continueTo) {
        router.replace(continueTo);
        return;
      }
      setAdded(true);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {!continueTo && (
        <div>
          <label className="label" htmlFor="passkey-name">
            Name for this passkey
          </label>
          <input
            id="passkey-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="e.g. iPhone, Mac"
            className="field"
          />
        </div>
      )}
      {error && (
        <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {added && (
        <div role="status" className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Passkey added.
        </div>
      )}
      <button type="button" onClick={add} disabled={pending} className="btn-primary">
        {pending ? "Waiting for your device…" : label}
      </button>
    </div>
  );
}
