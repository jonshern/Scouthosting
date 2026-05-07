// Public tenant chrome. Reads the org shell from the same disk-backed
// snapshot the homepage uses (lib/publish/snapshot.ts) so the header
// nav stays online during a database blip.
//
// Admin pages live under this layout too. /admin/* re-queries Prisma
// directly (admins need live data and tolerate DB errors), so the
// snapshot fallback only protects the public surface here.

import { notFound } from "next/navigation";
import Link from "next/link";
import { loadHomeSnapshot } from "@/lib/publish/snapshot";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const shell = await loadHomeSnapshot(slug);
  if (!shell) notFound();
  const { org, customPages } = shell;
  if (org.suspendedAt) {
    return (
      <main className="mx-auto max-w-content px-6 py-16">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="font-display text-2xl font-semibold">This site is paused.</h1>
          <p className="mt-2 text-slate-muted">
            {org.suspendedReason ?? "Contact the unit's leaders."}
          </p>
        </div>
      </main>
    );
  }
  return (
    <div
      style={{
        ["--forest" as string]: org.primaryColor ?? undefined,
        ["--ember" as string]: org.accentColor ?? undefined,
      }}
    >
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-content items-center justify-between px-6 py-4">
          <Link href="/" className="font-display text-xl font-semibold">
            {org.displayName}
          </Link>
          <nav
            aria-label="Site"
            className="flex flex-wrap items-center gap-6 text-sm"
          >
            <Link href="/calendar">Calendar</Link>
            <Link href="/photos">Photos</Link>
            <Link href="/posts">Posts</Link>
            {customPages.map((p) => (
              <Link key={p.slug} href={`/p/${p.slug}`}>
                {p.title}
              </Link>
            ))}
            <Link href="/admin">Admin</Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
