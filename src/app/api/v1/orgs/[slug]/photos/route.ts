// GET /api/v1/orgs/[id-or-slug]/photos — albums + previews for the
// mobile Photos screen.

import { prisma } from "@/lib/db";
import { json, requireOrgAccess, v1Route } from "@/lib/api/v1";

export const runtime = "nodejs";

export const GET = v1Route<{ slug: string }>(async (_req, { user, params }) => {
  const { org } = await requireOrgAccess(params.slug, user.id);

  const albums = await prisma.album.findMany({
    where: { orgId: org.id },
    orderBy: [{ takenAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      photos: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: 4,
        select: { id: true, filename: true, caption: true, takenAt: true },
      },
      _count: { select: { photos: true } },
    },
  });
  return json({
    albums: albums.map((a) => ({
      id: a.id,
      title: a.title,
      visibility: a.visibility,
      takenAt: a.takenAt,
      totalPhotos: a._count.photos,
      coverFilename: a.photos[0]?.filename ?? null,
      preview: a.photos.map((p) => ({
        id: p.id,
        filename: p.filename,
        caption: p.caption,
        takenAt: p.takenAt,
      })),
    })),
  });
});
