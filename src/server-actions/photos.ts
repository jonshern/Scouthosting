"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { buildKey, put } from "@/lib/storage/local";
import {
  encryptBytes,
  encryptField,
  unwrapDekWithMaster,
} from "@/lib/encryption";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per photo

const AlbumInput = z.object({
  orgSlug: z.string().min(1),
  id: z.string().optional(),
  title: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/, "Slug must be lowercase letters/digits/hyphens")
    .min(1),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  visibility: z.enum(["public", "members"]).default("public"),
});

async function authorize(orgSlug: string) {
  const { user } = await getSession();
  if (!user) return { error: "Not signed in." as const };
  const org = await prisma.org.findUnique({ where: { slug: orgSlug } });
  if (!org) return { error: "Site not found." as const };
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) return { error: "Not authorized." as const };
  return { user, org };
}

export async function upsertAlbum(_prev: unknown, formData: FormData) {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = AlbumInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorize(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const d = parsed.data;
  const data = {
    orgId: auth.org.id,
    title: d.title,
    slug: d.slug,
    description: d.description || null,
    visibility: d.visibility,
  };
  if (d.id) {
    const { count } = await prisma.album.updateMany({
      where: { id: d.id, orgId: auth.org.id },
      data,
    });
    if (count === 0) return { error: "Album not found." };
  } else {
    await prisma.album.create({ data });
  }
  revalidatePath(`/o/${auth.org.slug}/admin/photos`);
  revalidatePath(`/o/${auth.org.slug}/photos`);
  redirect(`/o/${auth.org.slug}/admin/photos`);
}

const UploadSchema = z.object({
  orgSlug: z.string().min(1),
  albumId: z.string().min(1),
});

export async function uploadPhotos(_prev: unknown, formData: FormData) {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = UploadSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    albumId: formData.get("albumId"),
  });
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authorize(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };

  const album = await prisma.album.findUnique({ where: { id: parsed.data.albumId } });
  if (!album || album.orgId !== auth.org.id) return { error: "Album not found." };

  const files = formData.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) return { error: "No files uploaded." };

  const errors: string[] = [];
  let count = 0;
  // Photos are encrypted with the org's DEK before being written to
  // storage. The original filename is encrypted into encOriginalName;
  // the on-disk key (`filename` column) is a random opaque path.
  const orgRow = await prisma.org.findUnique({
    where: { id: auth.org.id },
    select: { id: true, encryptedDek: true },
  });
  if (!orgRow || !orgRow.encryptedDek) {
    return { error: "Org encryption vault is not provisioned." };
  }
  const dek = unwrapDekWithMaster(orgRow);
  for (const file of files) {
    if (!ALLOWED_MIME.has(file.type)) {
      errors.push(`${file.name}: unsupported type ${file.type}`);
      continue;
    }
    if (file.size > MAX_BYTES) {
      errors.push(`${file.name}: too large (${(file.size / 1_000_000).toFixed(1)} MB)`);
      continue;
    }
    const key = buildKey(auth.org.id, "photos", file.name);
    const plain = Buffer.from(await file.arrayBuffer());
    const encrypted = encryptBytes(plain, dek, auth.org.id, "photo.bytes");
    await put(key, encrypted);
    await prisma.photo.create({
      data: {
        orgId: auth.org.id,
        albumId: album.id,
        filename: key,
        // Plaintext originalName intentionally null on encrypted photos;
        // encOriginalName carries it in ciphertext form.
        originalName: null,
        encOriginalName: encryptField(file.name, dek, auth.org.id, "photo.originalName"),
        encrypted: true,
        mimeType: file.type,
        sizeBytes: file.size,
        uploaderUserId: auth.user.id,
      },
    });
    count += 1;
  }
  revalidatePath(`/o/${auth.org.slug}/photos/${album.slug}`);
  revalidatePath(`/o/${auth.org.slug}/admin/photos`);
  // Bust the public photos API cache + the homepage shell cache so a
  // newly-uploaded photo can become the hero image on the next render.
  updateTag("public-photos");
  updateTag("org-home-shell");
  return { ok: true as const, count, errors: errors.length ? errors : undefined };
}

const DeletePhotoSchema = z.object({ orgSlug: z.string().min(1), id: z.string().min(1) });

export async function deletePhoto(_prev: unknown, formData: FormData) {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = DeletePhotoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authorize(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const photo = await prisma.photo.findUnique({ where: { id: parsed.data.id } });
  if (!photo || photo.orgId !== auth.org.id) return { error: "Photo not found." };
  await prisma.photo.delete({ where: { id: photo.id } });
  // Note: file bytes left on disk; orphan-cleanup job sweeps them later.
  revalidatePath(`/o/${auth.org.slug}/admin/photos`);
  return { ok: true as const };
}
