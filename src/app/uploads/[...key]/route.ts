import { NextResponse } from "next/server";
import { get, head } from "@/lib/storage";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { verifyToken } from "@/lib/auth/api-token";
import { roleInOrg } from "@/lib/auth/role";
import { decryptBytes, unwrapDekWithMaster } from "@/lib/encryption";
import { decidePhotoAccess, photoHeaders } from "@/lib/photos/access";

export const dynamic = "force-dynamic";

// Web pages send the session cookie; the mobile app sends its bearer
// token (it can't share the browser's cookies).
async function viewerFor(req: Request): Promise<{ id: string; isSuperAdmin: boolean } | null> {
  const auth = req.headers.get("authorization");
  if (auth) {
    const verified = await verifyToken(auth, prisma);
    if (!verified) return null;
    const user = await prisma.user.findUnique({
      where: { id: verified.userId },
      select: { id: true, isSuperAdmin: true },
    });
    return user;
  }
  const { user } = await getSession();
  return user ? { id: user.id, isSuperAdmin: !!user.isSuperAdmin } : null;
}

export async function GET(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: keyParts } = await ctx.params;
  const key = keyParts.join("/");
  const photo = await prisma.photo.findFirst({ where: { filename: key } });
  if (!photo) return new NextResponse("Not found", { status: 404 });

  let albumVisibility: string | null = null;
  if (photo.albumId) {
    const album = await prisma.album.findUnique({ where: { id: photo.albumId } });
    if (!album || album.orgId !== photo.orgId) return new NextResponse("Not found", { status: 404 });
    albumVisibility = album.visibility;
  }

  const needsViewer = albumVisibility === "members" || !!photo.messageId;
  const viewer = needsViewer ? await viewerFor(req) : null;
  let isOrgMember = false;
  let isChannelMember = false;
  if (viewer) {
    isOrgMember = !!(await roleInOrg(viewer.id, photo.orgId));
    if (photo.messageId) {
      const message = await prisma.message.findUnique({
        where: { id: photo.messageId },
        select: { channelId: true },
      });
      if (message) {
        isChannelMember = !!(await prisma.channelMember.findFirst({
          where: { channelId: message.channelId, userId: viewer.id },
          select: { userId: true },
        }));
      }
    }
  }

  const access = decidePhotoAccess({
    albumVisibility,
    isChatPhoto: !!photo.messageId,
    viewer: {
      signedIn: !!viewer,
      isSuperAdmin: !!viewer?.isSuperAdmin,
      isOrgMember,
      isChannelMember,
    },
  });
  if (!access.ok) return new NextResponse("Forbidden", { status: access.status });

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
  return new NextResponse(body, { headers: photoHeaders(photo.mimeType, body.byteLength) });
}
