// Public, read-only feed of recent photos from public albums for the
// unit homepage. No auth.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { unstable_cache } from "next/cache";

export const runtime = "nodejs";
export const revalidate = 60;

const fetchRecentPhotos = unstable_cache(
  async (slug: string) => {
    const org = await prisma.org.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!org) return null;
    const photos = await prisma.photo.findMany({
      where: { album: { orgId: org.id, visibility: "public" } },
      orderBy: { takenAt: "desc" },
      take: 12,
      select: {
        id: true,
        filename: true,
        caption: true,
        takenAt: true,
        album: { select: { slug: true, title: true } },
      },
    });
    return photos;
  },
  ["public", "org", "recent-photos"],
  { revalidate: 60, tags: ["public-photos"] },
);

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  try {
    const photos = await fetchRecentPhotos(slug);
    if (!photos) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(
      { photos },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  } catch {
    return NextResponse.json(
      { photos: [], error: "db_unavailable" },
      { status: 503 },
    );
  }
}
