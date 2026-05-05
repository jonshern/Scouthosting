import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-ink-muted/15 bg-white">
      <div className="mx-auto flex max-w-content items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
          <span aria-hidden className="inline-block h-3 w-3 rounded-full bg-forest" />
          Compass
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-6 text-sm">
          <Link href="/plans" className="text-ink hover:text-forest">Pricing</Link>
          <Link href="/security" className="text-ink hover:text-forest">Security</Link>
          <Link href="/login" className="text-ink hover:text-forest">Sign in</Link>
          <Link href="/signup" className="btn-primary">Start a site</Link>
        </nav>
      </div>
    </header>
  );
}
