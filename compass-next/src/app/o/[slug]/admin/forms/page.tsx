// /o/[slug]/admin/forms — list of forms (uploaded files or links).

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";

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
      <div className="flex items-end justify-between mb-6">
        <h1 className="font-display text-3xl">Forms</h1>
        <Link href={`/o/${slug}/admin/forms/new`} className="btn-primary">
          New form
        </Link>
      </div>
      {forms.length === 0 ? (
        <p className="text-ink-muted">No forms yet.</p>
      ) : (
        <ul className="space-y-2">
          {forms.map((f) => (
            <li key={f.id} className="card">
              <div className="font-medium">{f.title}</div>
              <div className="text-xs text-ink-muted">
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
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
