import Link from "next/link";

// Compass-rose mark — ported from the legacy Express marketing site.
function CompassMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden
      focusable="false"
    >
      <circle cx="20" cy="20" r="18.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="20" cy="20" r="11" fill="none" stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
      <path d="M20 3 L23.5 20 L20 16.5 L16.5 20 Z" className="fill-forest" />
      <path d="M20 37 L16.5 20 L20 23.5 L23.5 20 Z" fill="currentColor" opacity="0.85" />
      <path d="M37 20 L20 22.4 L22.4 20 L20 17.6 Z" fill="currentColor" opacity="0.5" />
      <path d="M3 20 L20 17.6 L17.6 20 L20 22.4 Z" fill="currentColor" opacity="0.5" />
      <circle cx="20" cy="20" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function Header() {
  return (
    <header className="border-b border-ink-muted/15 bg-white">
      <div className="mx-auto flex max-w-content items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-display text-xl font-semibold text-ink"
        >
          <CompassMark />
          <span>
            Compass<span className="text-forest">.</span>
          </span>
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-6 text-sm">
          <Link href="/plans" className="text-ink hover:text-forest">Pricing</Link>
          <Link href="/security" className="text-ink hover:text-forest">Security</Link>
          <Link href="/login" className="text-ink hover:text-forest">Sign in</Link>
          <Link href="/signup" className="btn-primary">Start a trial</Link>
        </nav>
      </div>
    </header>
  );
}
