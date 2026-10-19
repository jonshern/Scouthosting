// Login page. Layout follows design-handoff/signin-flow.jsx — split
// screen with a dark brand panel on the left and the auth card on
// the right. Google and Apple come first when their keys are set
// (components/auth/SocialSignIn.tsx), then passkeys, and email +
// password is folded behind a small link (open when the browser has no
// passkeys). With no Google/Apple keys the page starts at passkeys.

import Link from "next/link";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { PasskeySignIn, PasswordSignIn } from "@/components/auth/PasskeySignIn";
import { SocialSignIn, socialSignInAvailable } from "@/components/auth/SocialSignIn";
import { readCsrfToken } from "@/lib/security/csrf";
import { supportEmail } from "@/lib/support";

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
  const signupQuery = next ? `?next=${encodeURIComponent(next)}` : "";
  const ssoError = error ? ssoErrorMessage(error) : null;
  const csrf = (await readCsrfToken()) ?? "";
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
          <span className="font-display font-semibold text-xl tracking-tight">
            Compass<span className="text-sky">.</span>
          </span>
        </div>

        <div className="relative max-w-[540px]">
          <h1 className="font-display text-[44px] font-semibold leading-[1.05] tracking-[-0.02em] text-balance md:text-[56px]">
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
          <h2 className="font-display text-3xl font-semibold tracking-[-0.015em] md:text-4xl">
            Sign in
          </h2>
          <p className="mt-2 text-sm text-slate-muted">
            New here?{" "}
            <Link
              href={`/signup${signupQuery}`}
              className="font-medium text-sky hover:text-slate-ink"
            >
              Create an account
            </Link>
            .
          </p>

          {ssoError && (
            <div role="alert" className="mt-6 rounded border border-danger-line bg-danger-soft p-3 text-sm text-danger">
              {ssoError}
            </div>
          )}

          {socialSignInAvailable() && (
            <>
              <SocialSignIn next={next} className="mt-8" />
              <div className="mt-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-slate-muted">
                <span className="h-px flex-1 bg-line" />
                <span>Or</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <div className={socialSignInAvailable() ? "mt-6" : "mt-8"}>
            <PasskeySignIn csrf={csrf} next={next} mode="sign-in" />
          </div>

          <div className="mt-5">
            <PasswordSignIn
              csrf={csrf}
              csrfInput={<CsrfTokenInput />}
              next={next}
              startOpen={error === "account_not_linked"}
            />
          </div>

          <p className="mt-6 text-xs leading-[1.55] text-slate-muted">
            Trouble signing in? Ask the unit&apos;s scoutmaster to re-send your
            invite, or{" "}
            <a
              href={`mailto:${supportEmail()}`}
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
