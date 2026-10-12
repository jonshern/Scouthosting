// Login page. Layout follows design-handoff/signin-flow.jsx — split
// screen with a dark brand panel on the left and the auth card on
// the right. SSO providers (Google + Apple) sit above the email +
// password form. Microsoft and email-magic-link aren't wired yet
// (see src/app/api/auth/) so they're omitted; both can layer in
// later without changing this file's structure.

import Link from "next/link";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata = { title: "Sign in" };

function CompassMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden focusable="false">
      <circle cx="20" cy="20" r="18.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="20" cy="20" r="11" fill="none" stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
      <path d="M20 3 L23.5 20 L20 16.5 L16.5 20 Z" fill="#1d4ed8" />
      <path d="M20 37 L16.5 20 L20 23.5 L23.5 20 Z" fill="currentColor" opacity="0.85" />
      <path d="M3 20 L20 23.5 L16.5 20 L20 16.5 Z" fill="currentColor" opacity="0.4" />
      <path d="M37 20 L20 16.5 L23.5 20 L20 23.5 Z" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.61z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <path d="M14.94 13.57c-.27.62-.59 1.2-.97 1.73-.51.72-.93 1.22-1.26 1.5-.5.45-1.04.69-1.62.7-.41 0-.91-.12-1.49-.36-.58-.24-1.11-.36-1.6-.36-.51 0-1.06.12-1.65.36-.59.24-1.07.37-1.43.38-.55.02-1.1-.22-1.65-.72-.36-.31-.79-.83-1.32-1.57-.57-.79-1.04-1.71-1.41-2.76C.54 10.94.34 9.84.34 8.78c0-1.21.26-2.26.78-3.13.41-.71.96-1.27 1.65-1.68.69-.41 1.43-.62 2.23-.63.43 0 1.01.13 1.73.4.72.27 1.18.4 1.38.4.15 0 .66-.16 1.52-.47.81-.29 1.5-.41 2.07-.36 1.54.12 2.7.73 3.47 1.82-1.38.83-2.06 2-2.05 3.5.01 1.17.43 2.14 1.27 2.91.38.36.81.64 1.28.84-.1.3-.21.58-.33.86zM11.93 1.6c0 .9-.33 1.74-.99 2.52-.79.92-1.75 1.45-2.79 1.37-.01-.11-.02-.22-.02-.34 0-.86.38-1.78 1.04-2.55.33-.39.76-.71 1.27-.97.51-.25 1-.39 1.45-.42.01.13.04.26.04.39z" />
    </svg>
  );
}

// Google/Apple sign-in failures come back as /login?error=<code>.
function ssoErrorMessage(code: string): string {
  if (code === "account_not_linked") {
    return "There's already a Compass account with that email. Sign in with your password, confirm your email from your profile page, then Google or Apple sign-in will work too.";
  }
  if (code === "email_not_found") {
    return "Your Google or Apple account didn't share an email address, so we can't sign you in with it.";
  }
  return "Google or Apple sign-in didn't finish. Try again.";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const ssoQuery = next ? `?next=${encodeURIComponent(next)}` : "";
  const ssoError = error ? ssoErrorMessage(error) : null;
  return (
    <main className="min-h-screen bg-bg md:grid md:grid-cols-[1fr_560px]">
      {/* Brand panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-surface-dark px-12 py-14 text-white md:flex md:px-16">
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.05]" aria-hidden>
          <defs>
            <pattern id="signin-topo" width="48" height="48" patternUnits="userSpaceOnUse">
              <circle cx="24" cy="24" r="1" fill="currentColor" />
              <path d="M0 32 Q 24 24 48 32" fill="none" stroke="currentColor" strokeWidth="0.5" />
              <path d="M0 16 Q 24 8 48 16" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#signin-topo)" />
        </svg>

        <div className="relative flex items-center gap-3">
          <CompassMark size={26} />
          <span className="font-display text-xl tracking-tight">
            Compass<span className="text-sky">.</span>
          </span>
        </div>

        <div className="relative max-w-[540px]">
          <h1 className="font-display text-[44px] font-normal leading-[1.05] tracking-[-0.02em] text-balance md:text-[56px]">
            Welcome back.
            <br />
            <em className="font-normal not-italic text-sky md:italic">
              Pick up where the troop left off.
            </em>
          </h1>
          <p className="mt-6 max-w-[460px] text-base leading-[1.55] text-white/75">
            One sign-in covers every unit you serve. Compass remembers which
            troop you opened last and lands you there — switch any time from
            the top nav.
          </p>
        </div>

        <div className="relative flex gap-6 text-xs text-white/55">
          <span>Encrypted at rest</span>
          <span aria-hidden>·</span>
          <span>COPPA-conscious</span>
          <span aria-hidden>·</span>
          <span>US-hosted</span>
        </div>
      </aside>

      {/* Auth card */}
      <section className="flex flex-col justify-center px-6 py-14 md:px-16">
        <div className="mx-auto w-full max-w-md">
          <h2 className="font-display text-3xl font-normal tracking-[-0.015em] md:text-4xl">
            Sign in
          </h2>
          <p className="mt-2 text-sm text-slate-muted">
            New here?{" "}
            <Link
              href={`/signup${ssoQuery}`}
              className="font-medium text-sky hover:text-slate-ink"
            >
              Create an account
            </Link>
            .
          </p>

          {ssoError && (
            <div role="alert" className="mt-6 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {ssoError}
            </div>
          )}

          <div className="mt-8 grid gap-2.5">
            <a
              href={`/api/auth/google/begin${ssoQuery}`}
              className="inline-flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-white px-4 py-3 text-sm font-medium text-slate-ink transition-colors hover:border-slate-ink/40"
            >
              <GoogleIcon />
              Continue with Google
            </a>
            <a
              href={`/api/auth/apple/begin${ssoQuery}`}
              className="inline-flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-white px-4 py-3 text-sm font-medium text-slate-ink transition-colors hover:border-slate-ink/40"
            >
              <AppleIcon />
              Continue with Apple
            </a>
          </div>

          <div className="mt-7 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-slate-muted">
            <span className="h-px flex-1 bg-line" />
            <span>Or with password</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <div className="mt-6">
            <LoginForm csrf={<CsrfTokenInput />} next={next} />
          </div>

          <p className="mt-6 text-xs leading-[1.55] text-slate-muted">
            Trouble signing in? Ask the unit&apos;s scoutmaster to re-send your
            invite, or{" "}
            <a
              href="mailto:hello@scoutingcompass.com"
              className="text-sky hover:text-slate-ink"
            >
              email us
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
