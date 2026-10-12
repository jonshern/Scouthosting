// /o/[slug]/admin/merit-badge-counselors — counselor directory.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireAdminPage } from "@/lib/admin/guard";

export default async function MeritBadgeCounselorsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/merit-badge-counselors`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  const counselors = await prisma.meritBadgeCounselor.findMany({
    where: { orgId: org.id },
    orderBy: { name: "asc" },
  });

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <AdminPageHeader kicker="Roster" title="Merit badge counselors" />
      {counselors.length === 0 ? (
        <p className="text-slate-soft">No counselors yet.</p>
      ) : (
        <ul className="space-y-2">
          {counselors.map((c) => (
            <li key={c.id} className="card">
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-slate-muted">
                {[c.email, c.phone].filter(Boolean).join(" · ")}
              </div>
              {c.badges.length > 0 && (
                <div className="text-xs mt-1">
                  {c.badges.join(", ")}
                </div>
              )}
              {c.notes && (
                <p className="text-xs text-slate-muted mt-1">{c.notes}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
