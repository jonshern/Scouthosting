// Admin chrome. Replaces the old sidebar with the AdminBalanced
// top-nav from design_handoff_compass — Compass wordmark left, primary
// section links + sky-blue underline for the active section, settings
// links on the right. The page body is constrained to max-w-[1400px]
// at 32–40px gutters per the design.

import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { AdminTopNav } from "@/components/admin/AdminTopNav";
import { ReleasesStrip } from "@/components/site/ReleasesStrip";

function initials(email: string, displayName: string | null | undefined): string {
  const src = (displayName ?? email).trim();
  if (!src) return "·";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin`);
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) {
    return (
      <section className="mx-auto max-w-content px-6 py-16">
        <h1 className="font-display text-2xl font-semibold">Not authorized</h1>
        <p className="mt-2 text-slate-muted">Ask a leader to grant you admin access.</p>
      </section>
    );
  }
  const unitLabel = `${org.unitType ?? ""} ${org.unitNumber ?? ""}`.trim() || org.displayName;
  return (
    <div className="min-h-screen bg-bg">
      <AdminTopNav
        slug={slug}
        initials={initials(user.email, null)}
        unitLabel={unitLabel}
      />
      <main className="mx-auto max-w-[1400px] px-8 py-10">{children}</main>
      <ReleasesStrip variant="admin" />
    </div>
  );
}
