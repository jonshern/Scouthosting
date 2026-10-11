import { NextResponse } from "next/server";
import { get, head } from "@/lib/storage/local";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { roleInOrg } from "@/lib/auth/role";
import { decryptBytes, unwrapDekWithMaster } from "@/lib/encryption";

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
  let buf = await get(key);
  if (photo.encrypted) {
    const org = await prisma.org.findUnique({
      where: { id: photo.orgId },
      select: { id: true, encryptedDek: true },
    });
    if (!org || !org.encryptedDek) {
      return new NextResponse("Vault unavailable", { status: 423 });
    }
    const dek = unwrapDekWithMaster(org);
    try {
      buf = decryptBytes(buf, dek, photo.orgId, "photo.bytes");
    } catch {
      return new NextResponse("Decryption failed", { status: 500 });
    }
  }
  const body = new Uint8Array(buf);
  return new NextResponse(body, {
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, max-age=600",
    },
  });
}
