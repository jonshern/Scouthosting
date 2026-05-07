// /o/[slug]/admin/surveys/new — create a survey. Questions are
// authored as a textarea of one question per line in the format
// `<type>|<label>[|opt1,opt2]`. The action parses + validates.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { createSurvey } from "@/server-actions/surveys";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default async function NewSurveyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/surveys/new`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <AdminPageHeader kicker="Forms" title="New survey" />
      <form action={createSurvey} className="space-y-4 max-w-xl">
        <CsrfTokenInput />
        <input type="hidden" name="orgSlug" value={slug} />
        <label className="block">
          <span className="block text-sm">Title</span>
          <input name="title" required className="input mt-1" />
        </label>
        <label className="block">
          <span className="block text-sm">URL slug</span>
          <input
            name="slug"
            required
            placeholder="parent-survey-2026"
            pattern="[a-z0-9-]+"
            className="input mt-1"
          />
        </label>
        <label className="block">
          <span className="block text-sm">Description (optional)</span>
          <textarea name="description" rows={2} className="input mt-1" />
        </label>
        <label className="block">
          <span className="block text-sm">Audience</span>
          <select name="audience" defaultValue="anyone" className="input mt-1">
            <option value="anyone">Anyone (anonymous form)</option>
            <option value="members">Members (sign-in required)</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-sm">Closes at (optional)</span>
          <input name="closesAt" type="datetime-local" className="input mt-1" />
        </label>
        <label className="block">
          <span className="block text-sm">Questions</span>
          <p className="text-xs text-slate-muted mt-1 mb-1">
            One per line, format: <code>type|label|opt1,opt2</code>. Types:
            text · long · yesno · select · multi · scale.
          </p>
          <textarea
            name="questions"
            rows={8}
            required
            placeholder={`text|Your name\nlong|How was the campout?\nscale|Overall rating\nselect|Best meal|Spaghetti,Tacos,Pancakes`}
            className="input mt-1 font-mono text-xs"
          />
        </label>
        <button type="submit" className="btn-primary">
          Create survey
        </button>
      </form>
    </main>
  );
}
