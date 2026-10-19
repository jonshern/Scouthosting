import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { roleInOrg } from "@/lib/auth/role";

export const metadata = { title: "Photos" };

// One page of photos at a time: a big campout album would otherwise
// load every row (and every <img>) at once.
const PAGE = 60;

export default async function PublicAlbum({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; albumSlug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug, albumSlug } = await params;
  const page = Math.min(1000, Math.max(1, Math.floor(Number((await searchParams).page)) || 1));
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
    },
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

  const hasMore = album.photos.length > PAGE;
  const photos = album.photos.slice(0, PAGE);
  const pageHref = (n: number) => `/o/${slug}/photos/${albumSlug}${n > 1 ? `?page=${n}` : ""}`;

  return (
    <section className="mx-auto max-w-content px-6 py-12">
      <Link href={`/o/${slug}/photos`} className="text-sm">← All albums</Link>
      <h1 className="font-display text-3xl font-semibold mt-2">{album.title}</h1>
      {album.description && <p className="mt-2 text-ink-muted">{album.description}</p>}
      <div className="mt-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {photos.length === 0 && (
          <p className="text-ink-muted col-span-full">{page > 1 ? "No more photos." : "No photos yet."}</p>
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
        <nav className="mt-8 flex justify-between text-sm" aria-label="Album pages">
          {page > 1 ? <Link href={pageHref(page - 1)}>← Previous page</Link> : <span />}
          {hasMore ? <Link href={pageHref(page + 1)}>Next page →</Link> : <span />}
        </nav>
      )}
    </section>
  );
}
