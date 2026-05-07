// Public, read-only feed of recent announcements for the unit
// homepage. No auth.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { unstable_cache } from "next/cache";

export const runtime = "nodejs";
export const revalidate = 60;

const fetchAnnouncements = unstable_cache(
  async (slug: string) => {
    const org = await prisma.org.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!org) return null;
    const announcements = await prisma.announcement.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, body: true, createdAt: true },
    });
    return announcements;
  },
  ["public", "org", "announcements"],
  { revalidate: 60, tags: ["public-announcements"] },
);

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  try {
    const announcements = await fetchAnnouncements(slug);
    if (!announcements) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(
      { announcements },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
    );
  } catch {
    return NextResponse.json(
      { announcements: [], error: "db_unavailable" },
      { status: 503 },
    );
  }
}
