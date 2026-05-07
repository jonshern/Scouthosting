import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CsrfTokenInput } from "@/components/auth/CsrfTokenInput";
import { AlbumForm } from "@/components/admin/AlbumForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

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
    <section className="space-y-10">
      <AdminPageHeader
        kicker="Photos"
        title="Photo galleries"
        description="Create an album, then upload photos to it."
      />

      <div className="space-y-3">
        <h2 className="font-display text-2xl font-normal tracking-[-0.015em]">
          New album
        </h2>
        <AlbumForm orgSlug={slug} csrf={<CsrfTokenInput />} />
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-2xl font-normal tracking-[-0.015em]">
          Existing albums
        </h2>
        {org.albums.length === 0 ? (
          <p className="text-sm text-slate-muted">No albums yet.</p>
        ) : (
          <ul className="space-y-3">
            {org.albums.map((album) => (
              <li
                key={album.id}
                className="card flex items-start justify-between gap-4"
              >
                <div>
                  <Link
                    href={`/o/${slug}/admin/photos/${album.slug}`}
                    className="text-base font-semibold text-slate-ink hover:text-sky"
                  >
                    {album.title}
                  </Link>
                  <div className="mt-1 text-sm text-slate-soft">
                    {album._count.photos} photo
                    {album._count.photos === 1 ? "" : "s"} ·
                    {album.visibility === "members" ? " members only" : " public"}
                  </div>
                </div>
                <Link
                  href={`/o/${slug}/photos/${album.slug}`}
                  className="text-sm text-sky hover:text-slate-ink"
                >
                  View public →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
