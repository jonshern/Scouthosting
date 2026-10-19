import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { roleInOrg } from "@/lib/auth/role";
import { PublicPageHeader } from "@/components/site/PublicPageHeader";

export const metadata = { title: "Photos" };

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
    <>
      <PublicPageHeader
        kicker="§ Photos"
        title="Recent adventures."
        description="Albums from outings, campouts, courts of honor, and meetings."
      />
      <section className="mx-auto max-w-content px-6 pb-16">
        {albums.length === 0 ? (
          <p className="text-sm text-slate-muted">No public albums yet.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {albums.map((a) => {
              const cover = a.photos[0]?.filename;
              return (
                <Link
                  key={a.id}
                  href={`/o/${slug}/photos/${a.slug}`}
                  className="group block overflow-hidden rounded-xl border border-line bg-white transition-shadow hover:shadow-md"
                >
                  {cover ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/uploads/${cover}`}
                      alt={a.title}
                      className="aspect-video w-full object-cover transition-transform group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="aspect-video w-full bg-line-soft" aria-hidden />
                  )}
                  <div className="p-5">
                    <div className="font-display text-lg font-semibold text-slate-ink">
                      {a.title}
                    </div>
                    <div className="mt-1 text-sm text-slate-soft">
                      {a._count.photos} photo
                      {a._count.photos === 1 ? "" : "s"}
                      {a.visibility === "members" ? " · members only" : ""}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
