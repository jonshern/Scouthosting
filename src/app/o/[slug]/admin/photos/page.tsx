import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { AlbumForm } from "@/components/admin/AlbumForm";

export default async function AdminPhotosIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({
    where: { slug },
    include: {
      albums: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { _count: { select: { photos: true } } },
      },
    },
  });
  if (!org) notFound();

  return (
    <section className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Photos</h1>
        <p className="mt-2 text-ink-muted">Create an album, then upload photos to it.</p>
      </div>

      <div>
        <h2 className="font-display text-xl font-semibold mb-3">New album</h2>
        <AlbumForm orgSlug={slug} csrf={<CsrfTokenInput />} />
      </div>

      <div>
        <h2 className="font-display text-xl font-semibold mb-3">Existing albums</h2>
        {org.albums.length === 0 && <p className="text-ink-muted">No albums yet.</p>}
        <ul className="space-y-3">
          {org.albums.map((album) => (
            <li key={album.id} className="card flex items-start justify-between gap-4">
              <div>
                <Link
                  href={`/o/${slug}/admin/photos/${album.slug}`}
                  className="font-medium text-base"
                >
                  {album.title}
                </Link>
                <div className="mt-1 text-sm text-ink-muted">
                  {album._count.photos} photo{album._count.photos === 1 ? "" : "s"} ·
                  {album.visibility === "members" ? " members only" : " public"}
                </div>
              </div>
              <Link
                href={`/o/${slug}/photos/${album.slug}`}
                className="text-sm"
              >
                View public →
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
