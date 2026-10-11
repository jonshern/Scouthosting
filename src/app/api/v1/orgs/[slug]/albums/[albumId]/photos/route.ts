// POST /api/v1/orgs/[id-or-slug]/albums/[albumId]/photos — multipart
// upload from the mobile camera. Body is multipart/form-data with a
// "photo" file part. Leaders and admins only.
//
// Same rules as the web uploader (server-actions/photos.ts): images
// only (checked by content, not just the declared type), 10 MB cap, and
// bytes + original filename encrypted with the org's DEK before they
// touch storage.

import { updateTag } from "next/cache";
import { prisma } from "@/lib/db";
import {
  ApiError,
  LEADER_ROLES,
  LIMITS,
  badRequest,
  json,
  parseId,
  requireOrgAccess,
  v1Route,
} from "@/lib/api/v1";
import { put, buildKey } from "@/lib/storage";
import { EXT_BY_MIME, sniffImageType } from "@/lib/api/image-type";
import { encryptBytes, encryptField, unwrapDekWithMaster } from "@/lib/encryption";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;
// Multipart framing adds a little on top of the file itself.
const MAX_REQUEST_BYTES = MAX_BYTES + 64 * 1024;

export const POST = v1Route<{ slug: string; albumId: string }>(
  async (req, { user, params }) => {
    const { org } = await requireOrgAccess(params.slug, user.id, {
      write: true,
      roles: LEADER_ROLES,
    });
    const albumId = parseId(params.albumId, "album_not_found");
    const album = await prisma.album.findFirst({
      where: { id: albumId, orgId: org.id },
      select: { id: true, slug: true },
    });
    if (!album) throw new ApiError(404, "album_not_found");

    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_REQUEST_BYTES) throw new ApiError(413, "too_large");

    const form = await req.formData().catch(() => null);
    if (!form) throw badRequest("bad_form");
    const file = form.get("photo");
    if (!(file instanceof File)) throw badRequest("no_file");
    if (file.size === 0) throw badRequest("empty_file");
    if (file.size > MAX_BYTES) throw new ApiError(413, "too_large");

    const plain = Buffer.from(await file.arrayBuffer());
    const mimeType = sniffImageType(plain);
    if (!mimeType) throw new ApiError(415, "unsupported_type");

    const vault = await prisma.org.findUnique({
      where: { id: org.id },
      select: { encryptedDek: true },
    });
    if (!vault?.encryptedDek) throw new ApiError(423, "vault_unavailable");
    const dek = unwrapDekWithMaster(vault);

    const originalName = (file.name || "photo").slice(0, 200);
    const key = buildKey(org.id, "photos", `photo${EXT_BY_MIME[mimeType]}`);
    await put(key, encryptBytes(plain, dek, org.id, "photo.bytes"));

    const photo = await prisma.photo.create({
      data: {
        orgId: org.id,
        albumId: album.id,
        filename: key,
        originalName: null,
        encOriginalName: encryptField(originalName, dek, org.id, "photo.originalName"),
        encrypted: true,
        mimeType,
        sizeBytes: plain.length,
        uploaderUserId: user.id,
      },
    });

    try {
      updateTag("public-photos");
      updateTag("org-home-shell");
    } catch {
      // Cache tags are best-effort outside a request scope (tests).
    }

    return json({
      photo: {
        id: photo.id,
        filename: photo.filename,
        mimeType: photo.mimeType,
        sizeBytes: photo.sizeBytes,
      },
    });
  },
  { limits: [LIMITS.photoUpload] },
);

