// /o/[slug]/admin/forms — list of forms (uploaded files or links).

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { deleteForm } from "@/server-actions/forms";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default async function FormsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/forms`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return null;
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  const forms = await prisma.form.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <main className="mx-auto max-w-content px-6 py-12">
      <AdminPageHeader
        kicker="Forms"
        title="Forms"
        actions={
          <Link href={`/o/${slug}/admin/forms/new`} className="btn-primary">
            New form
          </Link>
        }
      />
      {forms.length === 0 ? (
        <p className="text-slate-soft">No forms yet.</p>
      ) : (
        <ul className="space-y-2">
          {forms.map((f) => (
            <li key={f.id} className="card flex items-baseline justify-between">
              <div>
                <div className="font-medium">{f.title}</div>
                <div className="text-xs text-slate-muted">
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noreferrer" className="underline">
                      External link
                    </a>
                  ) : f.filename ? (
                    <a href={`/uploads/${f.filename}`} className="underline">
                      {f.originalName ?? "Download"}
                    </a>
                  ) : (
                    "(no file)"
                  )}
                  {f.category ? ` · ${f.category}` : ""}
                  {" · "}
                  {f.visibility}
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <Link
                  href={`/o/${slug}/admin/forms/${f.id}`}
                  className="btn-secondary text-xs"
                >
                  Edit
                </Link>
                <form action={deleteForm}>
                  <CsrfTokenInput />
                  <input type="hidden" name="orgSlug" value={slug} />
                  <input type="hidden" name="id" value={f.id} />
                  <button type="submit" className="btn-secondary text-xs">
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
