// POST /api/v1/orgs/[id-or-slug]/albums/[albumId]/photos — multipart
// upload from the mobile camera. Body is multipart/form-data with a
// "photo" file part. Stores via the storage facade and returns the
// new Photo row.

import { NextResponse, type NextRequest } from "next/server";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { withBearerAuth } from "@/lib/auth/api-bearer";
import { findOrgByIdOrSlug, requireOrgMember } from "@/lib/api/org-resolve";
import { put, buildKey } from "@/lib/storage";

export const runtime = "nodejs";

export const POST = withBearerAuth(async (req: NextRequest, { user }) => {
  const segments = req.nextUrl.pathname.split("/");
  // /api/v1/orgs/[idOrSlug]/albums/[albumId]/photos
  const idOrSlug = segments[4];
  const albumId = segments[6];
  const org = await findOrgByIdOrSlug(idOrSlug);
  if (!org) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const member = await requireOrgMember(org.id, user.id);
  if (!member || (member.role !== "leader" && member.role !== "admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const album = await prisma.album.findFirst({
    where: { id: albumId, orgId: org.id },
    select: { id: true },
  });
  if (!album) return NextResponse.json({ error: "album_not_found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "bad_form" }, { status: 400 });
  const file = form.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ error: "empty_file" }, { status: 400 });
  }
  if (buf.length > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const ext = path.extname(file.name || "").toLowerCase().slice(0, 8) || ".jpg";
  const random = crypto.randomBytes(8).toString("hex");
  const key = buildKey(org.id, "photos", `${random}${ext}`);
  await put(key, buf);

  const photo = await prisma.photo.create({
    data: {
      orgId: org.id,
      albumId: album.id,
      filename: key,
      originalName: file.name || null,
      mimeType: file.type || "image/jpeg",
      sizeBytes: buf.length,
    },
  });

  return NextResponse.json({
    photo: {
      id: photo.id,
      filename: photo.filename,
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
    },
  });
});
