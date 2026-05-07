// /o/[slug]/admin/eagle — Eagle Scouts roll + active EagleProjects.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default async function EaglePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/eagle`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  const [scouts, projects] = await Promise.all([
    prisma.eagleScout.findMany({
      where: { orgId: org.id },
      orderBy: [{ earnedAt: "desc" }, { sortOrder: "asc" }],
    }),
    prisma.eagleProject.findMany({
      where: { orgId: org.id, status: { not: "complete" } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <main className="mx-auto max-w-content px-6 py-12 space-y-10">
      <AdminPageHeader kicker="Roster" title="Eagle pipeline" />
      <section>
        {scouts.length === 0 ? (
          <p className="text-slate-soft">No Eagle Scouts on the roll yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {scouts.map((s) => (
              <li key={s.id}>
                <strong>
                  {s.firstName} {s.lastName}
                </strong>{" "}
                — {s.earnedAt.toLocaleDateString()}
                {s.projectName ? ` · ${s.projectName}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="font-display text-2xl font-normal tracking-[-0.015em] mb-3">Active Eagle projects</h2>
        {projects.length === 0 ? (
          <p className="text-slate-soft text-sm">No active projects.</p>
        ) : (
          <ul className="space-y-2">
            {projects.map((p) => (
              <li key={p.id} className="card">
                <div className="font-medium">{p.scoutName}</div>
                <div className="text-xs text-slate-muted">
                  {p.status}
                  {p.beneficiary ? ` · ${p.beneficiary}` : ""}
                  {p.mentorName ? ` · mentor: ${p.mentorName}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
