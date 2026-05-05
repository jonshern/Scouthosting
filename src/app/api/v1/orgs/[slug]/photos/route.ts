// GET /api/v1/orgs/[id-or-slug]/photos — albums + previews for the
// mobile Photos screen.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { withBearerAuth } from "@/lib/auth/api-bearer";
import { findOrgByIdOrSlug, requireOrgMember } from "@/lib/api/org-resolve";

export const runtime = "nodejs";

export const GET = withBearerAuth(async (req: NextRequest, { user }) => {
  const segments = req.nextUrl.pathname.split("/");
  const idOrSlug = segments[segments.length - 2] ?? "";
  const org = await findOrgByIdOrSlug(idOrSlug);
  if (!org) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const member = await requireOrgMember(org.id, user.id);
  if (!member) return NextResponse.json({ error: "forbidden" }, { status: 403 });

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
  return NextResponse.json({
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
