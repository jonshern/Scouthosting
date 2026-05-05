// /o/[slug]/admin/forms/new — create a Form (link or upload).

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { createForm } from "@/server-actions/forms";

export default async function NewFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user } = await getSession();
  if (!user) redirect(`/login?next=/o/${slug}/admin/forms/new`);
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
      <h1 className="font-display text-3xl mb-6">New form</h1>
      <form
        action={createForm}
        encType="multipart/form-data"
        className="space-y-4 max-w-md"
      >
        <CsrfTokenInput />
        <input type="hidden" name="orgSlug" value={slug} />
        <label className="block">
          <span className="block text-sm">Title</span>
          <input name="title" required className="input mt-1" />
        </label>
        <label className="block">
          <span className="block text-sm">External link (optional)</span>
          <input
            name="url"
            type="url"
            placeholder="https://docs.google.com/forms/..."
            className="input mt-1"
          />
        </label>
        <label className="block">
          <span className="block text-sm">…or upload a file</span>
          <input type="file" name="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="mt-1" />
        </label>
        <label className="block">
          <span className="block text-sm">Category</span>
          <input
            name="category"
            type="text"
            placeholder="health / permission / bylaws / welcome"
            className="input mt-1"
          />
        </label>
        <label className="block">
          <span className="block text-sm">Visibility</span>
          <select name="visibility" defaultValue="members" className="input mt-1">
            <option value="public">Public — anyone can see</option>
            <option value="members">Members only</option>
            <option value="leaders">Leaders only</option>
          </select>
        </label>
        <button type="submit" className="btn-primary">
          Create form
        </button>
      </form>
    </main>
  );
}
