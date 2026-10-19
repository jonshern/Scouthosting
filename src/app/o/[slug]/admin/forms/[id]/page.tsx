// /o/[slug]/admin/forms/[id] — edit existing form metadata.

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { updateForm } from "@/server-actions/forms";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata = { title: "Form" };

export default async function EditFormPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  await requireAdminPage(slug);
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/forms/${id}`);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) return notFound();
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return <p className="p-12">Not authorized.</p>;
  }

  const form = await prisma.form.findFirst({
    where: { id, orgId: org.id },
  });
  if (!form) return notFound();

  return (
    <section>
      <AdminPageHeader kicker="Forms" title={form.title} />
      <form
        action={updateForm}
        encType="multipart/form-data"
        className="space-y-4 max-w-md"
      >
        <CsrfTokenInput />
        <input type="hidden" name="orgSlug" value={slug} />
        <input type="hidden" name="id" value={form.id} />
        <label className="block">
          <span className="block text-sm">Title</span>
          <input
            name="title"
            required
            defaultValue={form.title}
            className="input mt-1"
          />
        </label>
        <label className="block">
          <span className="block text-sm">External link</span>
          <input
            name="url"
            type="url"
            defaultValue={form.url ?? ""}
            placeholder="https://..."
            className="input mt-1"
          />
        </label>
        <label className="block">
          <span className="block text-sm">
            Replace file (optional — keeps existing if blank)
          </span>
          <input
            type="file"
            name="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx"
            className="mt-1"
          />
          {form.filename && (
            <p className="text-xs text-slate-muted mt-1">
              Current: {form.originalName ?? form.filename}
            </p>
          )}
        </label>
        <label className="block">
          <span className="block text-sm">Category</span>
          <input
            name="category"
            type="text"
            defaultValue={form.category ?? ""}
            className="input mt-1"
          />
        </label>
        <label className="block">
          <span className="block text-sm">Visibility</span>
          <select
            name="visibility"
            defaultValue={form.visibility}
            className="input mt-1"
          >
            <option value="public">Public — anyone can see</option>
            <option value="members">Members only</option>
            <option value="leaders">Leaders only</option>
          </select>
        </label>
        <button type="submit" className="btn-primary">
          Save changes
        </button>
      </form>
    </section>
  );
}
