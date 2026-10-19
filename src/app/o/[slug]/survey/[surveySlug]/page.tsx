// /o/[slug]/survey/[surveySlug] — public survey form.

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { submitSurvey } from "@/server-actions/surveys";

type Question = {
  id: string;
  type: string;
  label: string;
  options?: string[];
  required?: boolean;
};

export default async function PublicSurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; surveySlug: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { slug, surveySlug } = await params;
  const sp = await searchParams;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return notFound();
  const survey = await prisma.survey.findFirst({
    where: { orgId: org.id, slug: surveySlug },
  });
  if (!survey) return notFound();

  const closed = survey.closesAt && survey.closesAt.getTime() < Date.now();
  if (closed) {
    return (
      <main className="mx-auto max-w-content px-6 py-16 text-center">
        <h1 className="font-display font-semibold text-3xl">{survey.title}</h1>
        <p className="mt-4 text-ink-muted">This survey is closed.</p>
      </main>
    );
  }

  const { user } = await getSession();
  const requiresAuth = survey.audience === "members";
  if (requiresAuth && !user) {
    return (
      <main className="mx-auto max-w-content px-6 py-16 text-center">
        <h1 className="font-display font-semibold text-3xl">{survey.title}</h1>
        <p className="mt-2 text-ink-muted">Members-only survey.</p>
        <a
          href={`/login?next=/o/${slug}/survey/${surveySlug}`}
          className="btn-primary mt-4 inline-block"
        >
          Sign in
        </a>
      </main>
    );
  }

  if (sp.submitted) {
    return (
      <main className="mx-auto max-w-content px-6 py-16 text-center">
        <h1 className="font-display font-semibold text-3xl">Thanks!</h1>
        <p className="mt-3 text-ink-muted">Your response has been recorded.</p>
      </main>
    );
  }

  const questions = (survey.questions as unknown as Question[]) ?? [];

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <h1 className="font-display font-semibold text-3xl mb-2">{survey.title}</h1>
      {survey.description && (
        <p className="text-ink-muted text-sm mb-6">{survey.description}</p>
      )}
      <form action={submitSurvey} className="space-y-4 max-w-xl">
        <CsrfTokenInput />
        <input type="hidden" name="surveyId" value={survey.id} />
        <input type="hidden" name="orgSlug" value={slug} />
        <input type="hidden" name="surveySlug" value={surveySlug} />

        {!user && (
          <>
            <label className="block">
              <span className="block text-sm">Your name</span>
              <input name="_name" required className="input mt-1" />
            </label>
            <label className="block">
              <span className="block text-sm">Email</span>
              <input
                name="_email"
                type="email"
                required
                className="input mt-1"
              />
            </label>
          </>
        )}

        {questions.map((q) => (
          <div key={q.id} className="block">
            <label className="block text-sm font-medium">{q.label}</label>
            {q.type === "long" ? (
              <textarea
                name={`q.${q.id}`}
                rows={3}
                required={q.required}
                className="input mt-1"
              />
            ) : q.type === "yesno" ? (
              <select
                name={`q.${q.id}`}
                required={q.required}
                className="input mt-1"
              >
                <option value="">—</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            ) : q.type === "select" ? (
              <select
                name={`q.${q.id}`}
                required={q.required}
                className="input mt-1"
              >
                <option value="">—</option>
                {(q.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : q.type === "multi" ? (
              <div className="mt-1 space-y-1">
                {(q.options ?? []).map((o) => (
                  <label key={o} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name={`q.${q.id}`} value={o} />
                    {o}
                  </label>
                ))}
              </div>
            ) : q.type === "scale" ? (
              <div className="mt-1 flex gap-3 text-sm">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="flex items-center gap-1">
                    <input
                      type="radio"
                      name={`q.${q.id}`}
                      value={String(n)}
                      required={q.required}
                    />
                    {n}
                  </label>
                ))}
              </div>
            ) : (
              <input
                name={`q.${q.id}`}
                required={q.required}
                className="input mt-1"
              />
            )}
          </div>
        ))}

        <button type="submit" className="btn-primary">
          Submit
        </button>
      </form>
    </main>
  );
}
