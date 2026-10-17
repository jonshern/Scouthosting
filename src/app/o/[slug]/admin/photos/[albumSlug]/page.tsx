import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { PhotoUploadForm } from "@/components/admin/PhotoUploadForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireAdminPage } from "@/lib/admin/guard";

// Same paging as the public album page: a big campout album would
// otherwise load every row (and every <img>) at once.
const PAGE = 60;

export default async function AdminAlbumDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; albumSlug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug, albumSlug } = await params;
  const page = Math.min(1000, Math.max(1, Math.floor(Number((await searchParams).page)) || 1));
  await requireAdminPage(slug);
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const album = await prisma.album.findUnique({
    where: { orgId_slug: { orgId: org.id, slug: albumSlug } },
    include: {
      photos: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * PAGE,
        take: PAGE + 1,
      },
      _count: { select: { photos: true } },
    },
  });
  if (!album) notFound();

  const hasMore = album.photos.length > PAGE;
  const photos = album.photos.slice(0, PAGE);
  const pageHref = (n: number) => `/o/${slug}/admin/photos/${albumSlug}${n > 1 ? `?page=${n}` : ""}`;

  return (
    <section className="space-y-10">
      <div>
        <Link href={`/o/${slug}/admin/photos`} className="text-sm">← All albums</Link>
        <div className="mt-1">
          <AdminPageHeader
            kicker="Photos"
            title={album.title}
            description={`${album._count.photos} ${album._count.photos === 1 ? "photo" : "photos"}`}
          />
        </div>
      </div>

      <PhotoUploadForm orgSlug={slug} albumId={album.id} csrf={<CsrfTokenInput />} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {photos.length === 0 && (
          <p className="text-slate-soft col-span-full">{page > 1 ? "No more photos." : "No photos yet."}</p>
        )}
        {photos.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p.id}
            src={`/uploads/${p.filename}`}
            alt={p.originalName ?? album.title}
            className="aspect-square w-full object-cover rounded"
          />
        ))}
      </div>
      {(page > 1 || hasMore) && (
        <nav className="flex justify-between text-sm" aria-label="Album pages">
          {page > 1 ? <Link href={pageHref(page - 1)}>← Previous page</Link> : <span />}
          {hasMore ? <Link href={pageHref(page + 1)}>Next page →</Link> : <span />}
        </nav>
      )}
    </section>
  );
}
