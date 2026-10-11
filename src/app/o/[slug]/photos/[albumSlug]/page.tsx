import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { roleInOrg } from "@/lib/auth/role";

export default async function PublicAlbum({
  params,
}: {
  params: Promise<{ slug: string; albumSlug: string }>;
}) {
  const { slug, albumSlug } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const album = await prisma.album.findUnique({
    where: { orgId_slug: { orgId: org.id, slug: albumSlug } },
    include: { photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  if (!album) notFound();

  if (album.visibility === "members") {
    const { user } = await getSession();
    const role = user ? await roleInOrg(user.id, org.id) : null;
    if (!user || (!role && !user.isSuperAdmin)) {
      return (
        <section className="mx-auto max-w-content px-6 py-16 text-center">
          <h1 className="font-display text-2xl font-semibold">Members only</h1>
          <p className="mt-2 text-ink-muted">
            <Link href={`/login?next=/o/${slug}/photos/${albumSlug}`}>Sign in</Link> to view.
          </p>
        </section>
      );
    }
  }

  return (
    <section className="mx-auto max-w-content px-6 py-12">
      <Link href={`/o/${slug}/photos`} className="text-sm">← All albums</Link>
      <h1 className="font-display text-3xl font-semibold mt-2">{album.title}</h1>
      {album.description && <p className="mt-2 text-ink-muted">{album.description}</p>}
      <div className="mt-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
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
