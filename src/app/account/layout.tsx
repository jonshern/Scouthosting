// Shell for /account: the Compass header, the account nav and the page.

import Link from "next/link";
import { Wordmark } from "@/components/ui/Wordmark";
import { AccountNav } from "@/components/account/AccountNav";

export const metadata = { title: { default: "Your account", template: "%s — Compass" } };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const quiet = "rounded-lg px-3 py-2 text-ink-2 no-underline transition-colors hover:bg-sunk hover:text-ink";
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex min-h-[64px] max-w-content flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" className="no-underline" aria-label="Compass home">
            <Wordmark size={18} />
          </Link>
          <nav aria-label="Site" className="flex items-center gap-1 text-sm font-medium">
            <Link href="/select-org" className={quiet}>
              Your units
            </Link>
            <a href="/logout" className={quiet}>
              Sign out
            </a>
          </nav>
        </div>
      </header>
      <div className="mx-auto flex max-w-content flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:gap-10 md:py-12">
        <div className="md:w-[200px] md:shrink-0 empty:hidden">
          <AccountNav />
        </div>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
