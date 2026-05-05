import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { roleInOrg } from "@/lib/auth/role";

export default async function PublicPhotosIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await prisma.org.findUnique({ where: { slug } });
  if (!org) notFound();
  const { user } = await getSession();
  const isMember = user ? Boolean(await roleInOrg(user.id, org.id)) || user.isSuperAdmin : false;

  const albums = await prisma.album.findMany({
    where: {
      orgId: org.id,
      ...(isMember ? {} : { visibility: "public" }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      photos: { take: 1, orderBy: { createdAt: "asc" } },
      _count: { select: { photos: true } },
    },
  });

  return (
    <section className="mx-auto max-w-content px-6 py-12">
      <h1 className="font-display text-3xl font-semibold">Photos</h1>
      {albums.length === 0 ? (
        <p className="mt-4 text-ink-muted">No public albums yet.</p>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {albums.map((a) => {
            const cover = a.photos[0]?.filename;
            return (
              <Link key={a.id} href={`/o/${slug}/photos/${a.slug}`} className="card hover:shadow-md transition-shadow">
                {cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/uploads/${cover}`}
                    alt={a.title}
                    className="aspect-video w-full object-cover rounded mb-3"
                  />
                )}
                <div className="font-medium">{a.title}</div>
                <div className="text-sm text-ink-muted">
                  {a._count.photos} photo{a._count.photos === 1 ? "" : "s"}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
