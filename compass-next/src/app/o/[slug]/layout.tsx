import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  if (org.suspendedAt) {
    return (
      <main className="mx-auto max-w-content px-6 py-16">
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-6">
          <h1 className="font-display text-2xl font-semibold">This site is paused.</h1>
          <p className="mt-2 text-ink-muted">{org.suspendedReason ?? "Contact the unit's leaders."}</p>
        </div>
      </main>
    );
  }
  const brand = { primary: org.primaryColor, accent: org.accentColor };
  return (
    <div style={{ ["--forest" as string]: brand.primary, ["--ember" as string]: brand.accent }}>
      <header className="border-b border-ink-muted/15 bg-white">
        <div className="mx-auto flex max-w-content items-center justify-between px-6 py-4">
          <Link href="/" className="font-display text-xl font-semibold">{org.displayName}</Link>
          <nav aria-label="Site" className="flex items-center gap-6 text-sm">
            <Link href="/calendar">Calendar</Link>
            <Link href="/photos">Photos</Link>
            <Link href="/announcements">Announcements</Link>
            <Link href="/admin">Admin</Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
