import Link from "next/link";
import { marketingHref } from "@/lib/tenancy/marketing-link";
import { Wordmark } from "@/components/ui/Wordmark";

export async function Header() {
  const href = await marketingHref();
  const quiet = "rounded-lg px-3 py-2 text-ink-2 no-underline transition-colors hover:bg-sunk hover:text-ink";
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex min-h-[68px] max-w-content flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-3">
        <Link href="/" className="no-underline" aria-label="Compass home">
          <Wordmark size={19} />
        </Link>
        <nav aria-label="Primary" className="flex flex-wrap items-center gap-1 text-sm font-medium">
          <Link href={href("/plans")} className={quiet}>
            Pricing
          </Link>
          <Link href={href("/security")} className={quiet}>
            Security
          </Link>
          <Link href={href("/positioning")} className={`${quiet} hidden md:inline`}>
            Why Compass
          </Link>
          <Link href="/login" className={quiet}>
            Sign in
          </Link>
          <Link
            href="/start"
            className="ml-1 inline-flex min-h-[40px] items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-ink no-underline transition-colors hover:bg-accent-soft-text hover:text-accent-ink"
          >
            Start a trial
          </Link>
        </nav>
      </div>
    </header>
  );
}
