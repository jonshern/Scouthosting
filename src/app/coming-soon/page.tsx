// Apex (scoutingcompass.com) coming-soon gate. Visitors land here
// when they don't have a valid `compass_invite` cookie. Submitting a
// valid code sets the cookie via `submitInviteCode` and redirects to
// the marketing site. Tenant subdomains aren't gated by this — they
// belong to live orgs and bypass the middleware check.

import { ComingSoonForm } from "@/components/marketing/ComingSoonForm";

export const metadata = {
  title: "Compass — Coming soon",
  description: "Modern software for volunteer scouting units.",
  robots: { index: false, follow: false },
};

function CompassMark({ size = 56 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden
      focusable="false"
      className="text-ink"
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
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-16 bg-bg">
      <div className="w-full max-w-md text-center space-y-8">
        <div className="flex flex-col items-center gap-4">
          <CompassMark size={72} />
          <h1 className="font-display text-5xl font-semibold tracking-tight">
            Compass<span className="text-sky">.</span>
          </h1>
          <p className="text-slate-soft text-sm uppercase tracking-[0.16em]">
            Modern software for scouting units
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-2xl">Coming soon</h2>
          <p className="text-sm text-ink-muted">
            We&apos;re onboarding founding troops by invitation. Have a code?
          </p>
        </div>

        <ComingSoonForm />

        <div className="pt-4 border-t border-ink-muted/15 text-xs text-ink-muted space-y-2">
          <p>Don&apos;t have a code?</p>
          <a
            href="mailto:invite@scoutingcompass.com?subject=Invite%20code%20request"
            className="inline-block btn-secondary text-xs"
          >
            Request an invite code
          </a>
        </div>
      </div>
    </main>
  );
}
