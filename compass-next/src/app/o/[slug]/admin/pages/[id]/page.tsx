import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { CustomPageForm } from "@/components/admin/CustomPageForm";

export default async function EditCustomPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const page = await prisma.customPage.findUnique({ where: { id } });
  if (!page || page.orgId !== org.id) notFound();
  return (
    <section className="space-y-6">
      <Link href={`/o/${slug}/admin/pages`} className="text-sm">← All pages</Link>
      <h1 className="font-display text-3xl font-semibold">{page.title}</h1>
      <CustomPageForm
        orgSlug={slug}
        initial={{
          id: page.id,
          slug: page.slug,
          title: page.title,
          body: page.body,
          visibility: page.visibility,
          showInNav: page.showInNav,
          sortOrder: page.sortOrder,
        }}
        csrf={<CsrfTokenInput />}
      />
    </section>
  );
}
