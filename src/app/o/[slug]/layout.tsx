// Public tenant chrome. Reads the org shell from the same disk-backed
// snapshot the homepage uses (lib/publish/snapshot.ts) so the header
// nav stays online during a database blip.
//
// Admin pages live under this layout too. /admin/* re-queries Prisma
// directly (admins need live data and tolerate DB errors), so the
// snapshot fallback only protects the public surface here.

import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site/SiteHeader";
import { loadHomeSnapshot } from "@/lib/publish/snapshot";
import { orgBasePath } from "@/lib/tenancy/base-path";

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
  const base = await orgBasePath(slug);
  const where = [org.city, org.state].filter(Boolean).join(", ");
  const place = [org.charterOrg, where].filter(Boolean).join(" · ") || null;
  if (org.suspendedAt) {
    return (
      <main className="mx-auto max-w-content px-6 py-16">
        <div className="rounded-xl border border-attention/30 bg-attention-soft p-6">
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
      <SiteHeader
        base={base}
        name={org.displayName}
        place={place}
        customPages={customPages}
      />
      <main>{children}</main>
    </div>
  );
}
