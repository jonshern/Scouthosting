// /o/[slug]/admin/surveys — list surveys with response counts.

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata = { title: "Surveys" };

export default async function SurveysPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/surveys`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  const surveys = await prisma.survey.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { _count: { select: { responses: true } } },
  });

  return (
    <section>
      <AdminPageHeader
        kicker="Forms"
        title="Surveys"
        actions={
          <Link href={`/o/${slug}/admin/surveys/new`} className="btn-primary">
            New survey
          </Link>
        }
      />
      {surveys.length === 0 ? (
        <p className="text-slate-soft">No surveys yet.</p>
      ) : (
        <ul className="space-y-2">
          {surveys.map((s) => (
            <li key={s.id} className="card flex items-baseline justify-between">
              <div>
                <Link
                  href={`/o/${slug}/admin/surveys/${s.id}`}
                  className="font-medium"
                >
                  {s.title}
                </Link>
                <div className="text-xs text-slate-muted">
                  /survey/{s.slug} · {s.audience}
                  {s.closesAt
                    ? ` · closes ${s.closesAt.toLocaleDateString()}`
                    : ""}
                </div>
              </div>
              <span className="text-xs text-slate-muted">
                {s._count.responses} responses
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
