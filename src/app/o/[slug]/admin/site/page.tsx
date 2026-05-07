// /o/[slug]/admin/site — hero + canvas (text / image / CTA blocks).
// The canvas is a list editor: add a block, edit its fields, reorder
// or delete. Saves a draft; Publish promotes to customBlocks.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { HeroForm } from "@/components/admin/HeroForm";
import { CanvasEditor } from "@/components/admin/CanvasEditor";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default async function AdminSite({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({
    where: { slug },
    include: { page: true },
  });
  if (!org) notFound();
  const page = org.page;
  const draftBlocks = (page?.draftBlocks ?? page?.customBlocks ?? []) as unknown[];
  const hasDraft = !!page?.draftBlocks;

  return (
    <section className="space-y-10">
      <AdminPageHeader
        kicker="Site"
        title="Site hero"
        description="The headline + subhead at the top of your unit's public site."
      />
      <HeroForm
        orgSlug={slug}
        initial={{
          heroHeadline: page?.heroHeadline,
          heroLede: page?.heroLede,
        }}
        csrf={<CsrfTokenInput />}
      />

      <div>
        <div className="flex items-end justify-between mb-2">
          <div>
            <h2 className="font-display text-2xl font-normal tracking-[-0.015em]">Page canvas</h2>
            <p className="text-sm text-slate-soft">
              Blocks rendered below the hero. Add text, images, or CTAs;
              reorder or delete inline.
            </p>
          </div>
          <Link href={`/o/${slug}`} className="btn-secondary text-sm">
            View public page
          </Link>
        </div>
        {hasDraft && (
          <p className="text-xs text-amber-700 mb-3">
            Unpublished draft — Publish to make it live.
          </p>
        )}
        <CanvasEditor
          orgSlug={slug}
          blocks={draftBlocks as never}
          csrf={<CsrfTokenInput />}
        />
      </div>
    </section>
  );
}
