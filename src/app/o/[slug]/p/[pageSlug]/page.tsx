import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { roleInOrg } from "@/lib/auth/role";
import { renderMarkdownLite } from "@/lib/markdown";
import { PublicPageHeader } from "@/components/site/PublicPageHeader";

export default async function PublicCustomPage({
  params,
}: {
  params: Promise<{ slug: string; pageSlug: string }>;
}) {
  const { slug, pageSlug } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const page = await prisma.customPage.findUnique({
    where: { orgId_slug: { orgId: org.id, slug: pageSlug } },
  });
  if (!page) notFound();

  if (page.visibility === "members") {
    const { user } = await getSession();
    const role = user ? await roleInOrg(user.id, org.id) : null;
    if (!user || (!role && !user.isSuperAdmin)) {
      return (
        <section className="mx-auto max-w-content px-6 py-16 text-center">
          <h1 className="font-display text-2xl font-semibold">Members only</h1>
          <p className="mt-2 text-slate-muted">
            <Link
              href={`/login?next=/o/${slug}/p/${pageSlug}`}
              className="text-sky hover:text-slate-ink"
            >
              Sign in
            </Link>{" "}
            to view.
          </p>
        </section>
      );
    }
  }

  const html = renderMarkdownLite(page.body);

  return (
    <>
      <PublicPageHeader kicker="§ Page" title={page.title} />
      <article className="mx-auto max-w-3xl px-6 pb-16">
        <div
          className="prose prose-stone"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>
    </>
  );
}
