import Link from "next/link";
import { marketingHref } from "@/lib/tenancy/marketing-link";

// Compass-rose mark — design uses ink stroke + sky-blue accent on the
// north arrowhead. Two arrows (N + S) for visual asymmetry; E/W are dim.
function CompassMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden
      focusable="false"
    >
      <circle
        cx="20"
        cy="20"
        r="18.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <circle
        cx="20"
        cy="20"
        r="11"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.75"
        opacity="0.4"
      />
      <path
        d="M20 3 L23.5 20 L20 16.5 L16.5 20 Z"
        fill="#1d4ed8"
      />
      <path
        d="M20 37 L16.5 20 L20 23.5 L23.5 20 Z"
        fill="currentColor"
        opacity="0.85"
      />
      <path
        d="M37 20 L20 22.4 L22.4 20 L20 17.6 Z"
        fill="currentColor"
        opacity="0.5"
      />
      <path
        d="M3 20 L20 17.6 L17.6 20 L20 22.4 Z"
        fill="currentColor"
        opacity="0.5"
      />
      <circle cx="20" cy="20" r="1.6" fill="currentColor" />
    </svg>
  );
}

export async function Header() {
  const href = await marketingHref();
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-content items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-display text-xl font-semibold text-ink"
        >
          <CompassMark />
          <span>
            Compass<span className="text-sky">.</span>
          </span>
        </Link>
        <nav
          aria-label="Primary"
          className="flex items-center gap-6 text-[13px] tracking-[0.02em] text-slate-soft"
        >
          <Link href={href("/plans")} className="hover:text-ink">
            Pricing
          </Link>
          <Link href={href("/security")} className="hover:text-ink">
            Security
          </Link>
          <Link href={href("/positioning")} className="hover:text-ink hidden md:inline">
            Why Compass
          </Link>
          <Link href="/login" className="hover:text-ink">
            Sign in
          </Link>
          <Link
            href="/start"
            className="inline-flex items-center justify-center rounded-full bg-sky text-white px-4 py-2 text-[13px] font-semibold hover:bg-ink transition-colors"
          >
            Start a trial
          </Link>
        </nav>
      </div>
    </header>
  );
}
