"use server";

import path from "node:path";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { put, buildKey } from "@/lib/storage";

const VALID_VISIBILITY = new Set(["public", "members", "leaders"]);

const TextSchema = z.object({
  orgSlug: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().optional().or(z.literal("")),
  category: z.string().trim().max(80).optional().or(z.literal("")),
  visibility: z.string().min(1),
});

async function authorize(orgSlug: string) {
  const { user } = await getSession();
  if (!user) throw new Error("Sign in.");
  const org = await prisma.org.findUnique({ where: { slug: orgSlug } });
  if (!org) throw new Error("Org not found.");
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    throw new Error("Forbidden.");
  }
  return org;
}

export async function createForm(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const text = TextSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    title: formData.get("title"),
    url: formData.get("url"),
    category: formData.get("category"),
    visibility: formData.get("visibility"),
  });
  if (!text.success) throw new Error(text.error.issues[0]?.message ?? "Invalid input.");
  if (!VALID_VISIBILITY.has(text.data.visibility)) throw new Error("Bad visibility.");
  const org = await authorize(text.data.orgSlug);

  const file = formData.get("file");
  const url = (text.data.url || "").trim();
  if (!url && (!(file instanceof File) || file.size === 0)) {
    throw new Error("Provide a link or upload a file.");
  }

  let storageKey: string | null = null;
  let originalName: string | null = null;
  let mimeType: string | null = null;
  let sizeBytes: number | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > 25 * 1024 * 1024) throw new Error("File too large (25 MB cap).");
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name || "").toLowerCase().slice(0, 8) || ".bin";
    const random = crypto.randomBytes(8).toString("hex");
    storageKey = buildKey(org.id, "attachments", `${random}${ext}`);
    await put(storageKey, buf);
    originalName = file.name || null;
    mimeType = file.type || null;
    sizeBytes = buf.length;
  }

  await prisma.form.create({
    data: {
      orgId: org.id,
      title: text.data.title,
      url: url || null,
      filename: storageKey,
      originalName,
      mimeType,
      sizeBytes,
      category: text.data.category || null,
      visibility: text.data.visibility,
    },
  });
  redirect(`/o/${text.data.orgSlug}/admin/forms`);
}

const UpdateSchema = z.object({
  orgSlug: z.string().min(1),
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().optional().or(z.literal("")),
  category: z.string().trim().max(80).optional().or(z.literal("")),
  visibility: z.string().min(1),
});

export async function updateForm(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const parsed = UpdateSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    id: formData.get("id"),
    title: formData.get("title"),
    url: formData.get("url"),
    category: formData.get("category"),
    visibility: formData.get("visibility"),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input.");
  if (!VALID_VISIBILITY.has(parsed.data.visibility)) throw new Error("Bad visibility.");
  const org = await authorize(parsed.data.orgSlug);
  const row = await prisma.form.findFirst({
    where: { id: parsed.data.id, orgId: org.id },
  });
  if (!row) throw new Error("Not found.");

  const file = formData.get("file");
  const data: Record<string, unknown> = {
    title: parsed.data.title,
    url: parsed.data.url ? parsed.data.url.trim() : null,
    category: parsed.data.category || null,
    visibility: parsed.data.visibility,
  };

  if (file instanceof File && file.size > 0) {
    if (file.size > 25 * 1024 * 1024) throw new Error("File too large (25 MB cap).");
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name || "").toLowerCase().slice(0, 8) || ".bin";
    const random = crypto.randomBytes(8).toString("hex");
    const key = buildKey(org.id, "attachments", `${random}${ext}`);
    await put(key, buf);
    data.filename = key;
    data.originalName = file.name || null;
    data.mimeType = file.type || null;
    data.sizeBytes = buf.length;
  }

  await prisma.form.update({ where: { id: parsed.data.id }, data });
  redirect(`/o/${parsed.data.orgSlug}/admin/forms`);
}

export async function deleteForm(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const id = String(formData.get("id") ?? "");
  const org = await authorize(orgSlug);
  const row = await prisma.form.findFirst({
    where: { id, orgId: org.id },
    select: { id: true },
  });
  if (!row) throw new Error("Not found.");
  await prisma.form.delete({ where: { id } });
  redirect(`/o/${orgSlug}/admin/forms`);
}
