// Apex (scoutingcompass.com) coming-soon gate. Visitors land here
// when they don't have a valid `compass_invite` cookie. Layout
// follows design-handoff/coming-soon.jsx: dark slate hero left, white
// invite-code card right, status chip + stats row.
//
// Submitting a valid code sets the cookie via `submitInviteCode` and
// redirects to the marketing site. Tenant subdomains aren't gated by
// this — they belong to live orgs and bypass the middleware check.

import { ComingSoonForm } from "@/components/marketing/ComingSoonForm";

export const metadata = {
  title: "Compass — Coming soon",
  description: "Modern software for volunteer scouting units.",
  robots: { index: false, follow: false },
};

function CompassMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden
      focusable="false"
      className="text-white"
    >
      <circle cx="20" cy="20" r="18.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="20" cy="20" r="11" fill="none" stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
      <path d="M20 3 L23.5 20 L20 16.5 L16.5 20 Z" fill="#1d4ed8" />
      <path d="M20 37 L16.5 20 L20 23.5 L23.5 20 Z" fill="currentColor" opacity="0.85" />
      <path d="M3 20 L20 23.5 L16.5 20 L20 16.5 Z" fill="currentColor" opacity="0.4" />
      <path d="M37 20 L20 16.5 L23.5 20 L20 23.5 Z" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

export default function ComingSoonPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-surface-dark text-white">
      {/* Topo-style background pattern */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04]"
        aria-hidden
      >
        <defs>
          <pattern id="topo" width="48" height="48" patternUnits="userSpaceOnUse">
            <circle cx="24" cy="24" r="1" fill="currentColor" />
            <path d="M0 32 Q 24 24 48 32" fill="none" stroke="currentColor" strokeWidth="0.5" />
            <path d="M0 16 Q 24 8 48 16" fill="none" stroke="currentColor" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#topo)" />
      </svg>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-8 py-7 md:px-14">
        <div className="flex items-center gap-3">
          <CompassMark size={26} />
          <span className="font-display text-xl tracking-tight">
            Compass<span className="text-sky">.</span>
          </span>
        </div>
        <span className="hidden text-[11px] uppercase tracking-[0.16em] text-white/55 md:inline">
          Private beta · Spring 2026
        </span>
      </header>

      {/* Hero */}
      <div className="relative z-10 mx-auto grid max-w-[1280px] gap-10 px-8 pb-20 md:grid-cols-[1.2fr_480px] md:gap-16 md:px-14 md:pb-28">
        <div className="flex flex-col justify-center pt-4 md:pt-8">
          <span className="mb-7 inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] tracking-wide text-white/85">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sky" />
            Building with founding troops in private beta
          </span>

          <h1 className="font-display text-[56px] font-normal leading-[0.98] tracking-[-0.03em] md:text-[84px]">
            One place for your{" "}
            <em className="font-normal not-italic text-sky md:italic">whole troop.</em>
          </h1>

          <p className="mt-7 max-w-[560px] text-base leading-[1.55] text-white/75 md:text-lg">
            Compass replaces the patchwork of group texts, shared spreadsheets,
            payment links, and aging websites volunteer Scoutmasters keep alive
            on weekends. Calendar, dues, comms, public site — one tool, built
            for units, hosted in the US, COPPA-conscious.
          </p>

          <div className="mt-10 flex gap-8 text-[13px] text-white/55">
            <Stat n="Founding" l="batch onboarding" />
            <Sep />
            <Stat n="$0" l="for your first year" />
            <Sep />
            <Stat n="US-hosted" l="encrypted at rest" />
          </div>
        </div>

        {/* Invite-code card */}
        <div className="rounded-2xl bg-white p-8 text-slate-ink shadow-[0_24px_64px_rgba(0,0,0,0.35)] md:p-9">
          <div className="mb-1 font-display text-2xl font-normal tracking-[-0.015em]">
            Have an invite code?
          </div>
          <p className="mb-7 text-sm leading-[1.55] text-slate-muted">
            Founding-troop scoutmasters got codes to share. Drop one here to
            jump straight in.
          </p>

          <ComingSoonForm />

          <div className="mt-7 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-slate-muted">
            <span className="h-px flex-1 bg-line" />
            <span>No code?</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <a
            href="mailto:invite@scoutingcompass.com?subject=Invite%20code%20request"
            className="mt-4 block w-full rounded-lg border border-slate-ink/15 bg-surface-alt px-4 py-3 text-center text-sm font-medium text-slate-ink transition-colors hover:border-slate-ink/40 hover:bg-white"
          >
            Request an invite
          </a>

          <div className="mt-6 border-t border-line pt-4 text-center text-xs text-slate-muted">
            Already have an account?{" "}
            <a href="/login" className="font-medium text-sky hover:text-slate-ink">
              Sign in
            </a>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 px-8 py-5 text-[11px] text-white/40 md:px-14">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between">
          <span>Compass · Independent · Not affiliated with Scouting America or BSA</span>
          <a href="mailto:hello@scoutingcompass.com" className="hover:text-white/70">
            hello@scoutingcompass.com
          </a>
        </div>
      </footer>
    </main>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <div className="font-display text-2xl font-normal tracking-[-0.01em] text-white">
        {n}
      </div>
      <div>{l}</div>
    </div>
  );
}

function Sep() {
  return <div className="w-px self-stretch bg-white/15" aria-hidden />;
}
