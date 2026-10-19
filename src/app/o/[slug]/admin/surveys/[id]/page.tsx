// /o/[slug]/admin/surveys/[id] — survey detail + response inspector.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireAdminPage } from "@/lib/admin/guard";

type Question = {
  id: string;
  type: string;
  label: string;
  options?: string[];
  required?: boolean;
};

export default async function SurveyDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  await requireAdminPage(slug);
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/surveys/${id}`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return notFound();
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  const survey = await prisma.survey.findFirst({
    where: { id, orgId: org.id },
    include: {
      responses: { orderBy: { createdAt: "desc" }, take: 200 },
    },
  });
  if (!survey) return notFound();

  const questions = (survey.questions as unknown as Question[]) ?? [];

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <AdminPageHeader
        kicker="Forms"
        title={survey.title}
        description={
          <>
            Public link:{" "}
            <Link
              href={`/o/${slug}/survey/${survey.slug}`}
              className="font-mono underline"
            >
              /survey/{survey.slug}
            </Link>
            {" · "}
            {survey.audience}
          </>
        }
      />

      <section className="mb-8">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.015em] mb-3">
          Responses ({survey.responses.length})
        </h2>
        {survey.responses.length === 0 ? (
          <p className="text-slate-soft">No responses yet.</p>
        ) : (
          <ul className="space-y-3">
            {survey.responses.map((r) => {
              const answers = r.answers as Record<string, unknown>;
              return (
                <li key={r.id} className="card text-sm">
                  <div className="flex items-baseline justify-between">
                    <strong>{r.name}</strong>
                    <span className="text-xs text-slate-muted">
                      {r.createdAt.toLocaleString()}
                    </span>
                  </div>
                  {r.email && (
                    <p className="text-xs text-slate-muted">{r.email}</p>
                  )}
                  <dl className="mt-2 grid grid-cols-[160px_1fr] gap-x-3 gap-y-1">
                    {questions.map((q) => (
                      <div key={q.id} className="contents">
                        <dt className="text-slate-muted text-xs">{q.label}</dt>
                        <dd className="text-xs">
                          {formatAnswer(answers[q.id])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold tracking-[-0.015em] mb-3">Questions</h2>
        <ul className="text-sm space-y-1">
          {questions.map((q) => (
            <li key={q.id}>
              <strong>{q.label}</strong>{" "}
              <span className="text-xs text-slate-muted">({q.type})</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function formatAnswer(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}
