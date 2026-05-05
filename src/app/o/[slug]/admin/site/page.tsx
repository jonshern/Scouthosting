import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { HeroForm } from "@/components/admin/HeroForm";

export default async function AdminSite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({
    where: { slug },
    include: { page: true },
  });
  if (!org) notFound();
  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Site hero</h1>
        <p className="mt-2 text-ink-muted">
          The headline + subhead at the top of your unit&apos;s public site.
        </p>
      </div>
      <HeroForm
        orgSlug={slug}
        initial={{
          heroHeadline: org.page?.heroHeadline,
          heroLede: org.page?.heroLede,
        }}
        csrf={<CsrfTokenInput />}
      />
    </section>
  );
}
