import { NextResponse } from "next/server";
import { get, head } from "@/lib/storage/local";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { roleInOrg } from "@/lib/auth/role";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: keyParts } = await ctx.params;
  const key = keyParts.join("/");
  const photo = await prisma.photo.findFirst({ where: { filename: key } });
  if (!photo) return new NextResponse("Not found", { status: 404 });

  // If it's an album photo, check album visibility.
  if (photo.albumId) {
    const album = await prisma.album.findUnique({ where: { id: photo.albumId } });
    if (!album) return new NextResponse("Not found", { status: 404 });
    if (album.visibility === "members") {
      const { user } = await getSession();
      if (!user) return new NextResponse("Forbidden", { status: 403 });
      const role = await roleInOrg(user.id, photo.orgId);
      if (!role && !user.isSuperAdmin) return new NextResponse("Forbidden", { status: 403 });
    }
  }
  // Chat-attached photos: full implementation requires the channel
  // permission check from chatPermissions.js; until that ports, deny.
  if (photo.messageId) {
    const { user } = await getSession();
    if (!user) return new NextResponse("Forbidden", { status: 403 });
    // TODO: port chat two-deep guard. For now require any membership.
    const role = await roleInOrg(user.id, photo.orgId);
    if (!role && !user.isSuperAdmin) return new NextResponse("Forbidden", { status: 403 });
  }

  const meta = await head(key);
  if (!meta.exists) return new NextResponse("Not found", { status: 404 });
  const buf = await get(key);
  // Convert Node Buffer to a fresh Uint8Array so it satisfies BodyInit.
  const body = new Uint8Array(buf);
  return new NextResponse(body, {
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Length": String(meta.size ?? body.byteLength),
      "Cache-Control": "private, max-age=600",
    },
  });
}
