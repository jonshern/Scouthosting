// /o/[slug]/admin/site — Simple form-driven editor (per
// design_handoff_compass_cms §1) with a live preview pane on the
// right. Hero + canvas form on the left; preview iframe with
// phone/tablet/desktop frame switcher on the right. Saves go
// through the same actions as before; Publish promotes draftBlocks
// → customBlocks.

import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { HeroForm } from "@/components/admin/HeroForm";
import { CanvasEditor } from "@/components/admin/CanvasEditor";
import { AdvancedCanvasEditor } from "@/components/admin/AdvancedCanvasEditor";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { PreviewPane } from "@/components/admin/PreviewPane";
import { requireAdminPage } from "@/lib/admin/guard";

export const metadata = { title: "Site editor" };

export default async function AdminSite({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(slug);
  const { mode } = await searchParams;
  const advanced = mode === "advanced";
  const org = await prisma.org.findUnique({
    where: { slug },
    include: { page: true },
  });
  if (!org) notFound();
  const page = org.page;
  const draftBlocks = (page?.draftBlocks ?? page?.customBlocks ?? []) as unknown[];
  const hasDraft = !!page?.draftBlocks;

  // Build the absolute URL the iframe should load. We prefer the
  // tenant subdomain when reachable so the preview matches what
  // visitors see; fall back to the apex /o/<slug> route.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const previewSrc = `${proto}://${host}/o/${slug}`;

  return (
    <section className="space-y-8">
      <AdminPageHeader
        kicker="Site"
        title="Site editor"
        description="Hero + page-canvas blocks. Edit the form on the left; the preview on the right reloads on demand."
        actions={
          <>
            <Link
              href={
                advanced
                  ? `/o/${slug}/admin/site`
                  : `/o/${slug}/admin/site?mode=advanced`
              }
              className="btn-secondary"
            >
              {advanced ? "Simple editor" : "Advanced editor"}
            </Link>
            <Link href={`/o/${slug}`} className="btn-secondary">
              View public page
            </Link>
          </>
        }
      />

      {hasDraft ? (
        <p className="text-xs text-warn">
          Unpublished draft — Publish from the canvas controls below to make it live.
        </p>
      ) : null}

      {advanced ? (
        <div className="space-y-8">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-[-0.015em] mb-3">
              Hero
            </h2>
            <HeroForm
              orgSlug={slug}
              initial={{
                heroHeadline: page?.heroHeadline,
                heroLede: page?.heroLede,
              }}
              csrf={<CsrfTokenInput />}
            />
          </div>

          <div>
            <h2 className="font-display text-2xl font-semibold tracking-[-0.015em] mb-3">
              Page canvas
            </h2>
            <p className="text-sm text-slate-soft mb-3">
              Three-column editor: palette on the left, canvas in the middle,
              inspector on the right. Click a block in the canvas to edit it.
            </p>
            <AdvancedCanvasEditor
              orgSlug={slug}
              blocks={draftBlocks as never}
              csrf={<CsrfTokenInput />}
            />
          </div>

          <div className="border-t border-line pt-6">
            <h2 className="font-display text-2xl font-semibold tracking-[-0.015em] mb-3">
              Live preview
            </h2>
            <PreviewPane src={previewSrc} />
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-8 min-w-0">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-[-0.015em] mb-3">
                Hero
              </h2>
              <HeroForm
                orgSlug={slug}
                initial={{
                  heroHeadline: page?.heroHeadline,
                  heroLede: page?.heroLede,
                }}
                csrf={<CsrfTokenInput />}
              />
            </div>

            <div>
              <h2 className="font-display text-2xl font-semibold tracking-[-0.015em] mb-3">
                Page canvas
              </h2>
              <p className="text-sm text-slate-soft mb-3">
                Blocks rendered below the hero. Add text, images, or CTAs;
                reorder or delete inline.
              </p>
              <CanvasEditor
                orgSlug={slug}
                blocks={draftBlocks as never}
                csrf={<CsrfTokenInput />}
              />
            </div>
          </div>

          <div className="lg:sticky lg:top-4 self-start min-w-0">
            <PreviewPane src={previewSrc} />
          </div>
        </div>
      )}
    </section>
  );
}
