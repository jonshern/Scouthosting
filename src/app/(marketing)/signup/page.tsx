// Signup page. Mirrors the split-screen sign-in layout so the auth
// flows feel consistent. Visuals from design-handoff/signin-flow.jsx.

import Link from "next/link";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata = { title: "Sign up" };

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

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Kept through sign-up so the phone apps' sign-in (/auth/mobile/begin)
  // comes back to the app after a new account is made.
  const { next } = await searchParams;
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <main className="min-h-screen bg-bg md:grid md:grid-cols-[1fr_560px]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-surface-dark px-12 py-14 text-white md:flex md:px-16">
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.05]" aria-hidden>
          <defs>
            <pattern id="signup-topo" width="48" height="48" patternUnits="userSpaceOnUse">
              <circle cx="24" cy="24" r="1" fill="currentColor" />
              <path d="M0 32 Q 24 24 48 32" fill="none" stroke="currentColor" strokeWidth="0.5" />
              <path d="M0 16 Q 24 8 48 16" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#signup-topo)" />
        </svg>

        <div className="relative flex items-center gap-3">
          <CompassMark size={26} />
          <span className="font-display text-xl tracking-tight">
            Compass<span className="text-sky">.</span>
          </span>
        </div>

        <div className="relative max-w-[540px]">
          <h1 className="font-display text-[44px] font-normal leading-[1.05] tracking-[-0.02em] text-balance md:text-[56px]">
            Start with your first
            <br />
            <em className="font-normal not-italic text-sky md:italic">
              meeting on the calendar.
            </em>
          </h1>
          <p className="mt-6 max-w-[460px] text-base leading-[1.55] text-white/75">
            Compass is invite-only during private beta. Your scoutmaster sets up
            the unit, then sends you a link — no password to remember if you
            don&apos;t want one.
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

      <section className="flex flex-col justify-center px-6 py-14 md:px-16">
        <div className="mx-auto w-full max-w-md">
          <h2 className="font-display text-3xl font-normal tracking-[-0.015em] md:text-4xl">
            Create your account
          </h2>
          <p className="mt-2 text-sm text-slate-muted">
            Already have one?{" "}
            <Link href={`/login${nextQuery}`} className="font-medium text-sky hover:text-slate-ink">
              Sign in
            </Link>
            .
          </p>

          <div className="mt-8 grid gap-2.5">
            <a
              href={`/api/auth/google/begin${nextQuery}`}
              className="inline-flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-white px-4 py-3 text-sm font-medium text-slate-ink transition-colors hover:border-slate-ink/40"
            >
              Continue with Google
            </a>
            <a
              href={`/api/auth/apple/begin${nextQuery}`}
              className="inline-flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-white px-4 py-3 text-sm font-medium text-slate-ink transition-colors hover:border-slate-ink/40"
            >
              Continue with Apple
            </a>
          </div>

          <div className="mt-7 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-slate-muted">
            <span className="h-px flex-1 bg-line" />
            <span>Or with email</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <div className="mt-6">
            <SignupForm csrf={<CsrfTokenInput />} next={next} />
          </div>
        </div>
      </section>
    </main>
  );
}
