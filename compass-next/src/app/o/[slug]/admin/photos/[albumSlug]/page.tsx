import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { PhotoUploadForm } from "@/components/admin/PhotoUploadForm";

export default async function AdminAlbumDetail({
  params,
}: {
  params: Promise<{ slug: string; albumSlug: string }>;
}) {
  const { slug, albumSlug } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const album = await prisma.album.findUnique({
    where: { orgId_slug: { orgId: org.id, slug: albumSlug } },
    include: {
      photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!album) notFound();

  return (
    <section className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">{album.title}</h1>
        <Link href={`/o/${slug}/admin/photos`} className="text-sm">← All albums</Link>
      </div>

      <PhotoUploadForm orgSlug={slug} albumId={album.id} csrf={<CsrfTokenInput />} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {album.photos.length === 0 && <p className="text-ink-muted col-span-full">No photos yet.</p>}
        {album.photos.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p.id}
            src={`/uploads/${p.filename}`}
            alt={p.originalName ?? album.title}
            className="aspect-square w-full object-cover rounded"
          />
        ))}
      </div>
    </section>
  );
}
