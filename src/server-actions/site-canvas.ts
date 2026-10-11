"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { normaliseCustomBlock } from "@/lib/homepage/sections";

const Schema = z.object({
  orgSlug: z.string().min(1),
  blocks: z.string().min(1),
});

async function authorize(orgSlug: string) {
  const { user } = await getSession();
  if (!user) throw new Error("Sign in.");
  const org = await prisma.org.findUnique({
    where: { slug: orgSlug },
    include: { page: true },
  });
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

function parseBlocks(raw: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Bad blocks payload.");
  }
  if (!Array.isArray(parsed)) throw new Error("Blocks must be an array.");
  // Validate each block via the canonical normaliser so unknown types
  // / shape mismatches fail loud.
  return parsed.map((b) => normaliseCustomBlock(b));
}

export async function saveDraftBlocks(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid input.");
  const org = await authorize(parsed.data.orgSlug);
  const blocks = parseBlocks(parsed.data.blocks);

  await prisma.page.upsert({
    where: { orgId: org.id },
    create: { orgId: org.id, draftBlocks: blocks as never },
    update: { draftBlocks: blocks as never },
  });
  revalidatePath(`/o/${parsed.data.orgSlug}/admin/site`);
}

export async function publishBlocks(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid input.");
  const org = await authorize(parsed.data.orgSlug);
  const blocks = parseBlocks(parsed.data.blocks);

  // Snapshot the previous customBlocks into PageVersion if it exists.
  const existingPage = await prisma.page.findUnique({
    where: { orgId: org.id },
    select: { id: true, customBlocks: true },
  });
  if (existingPage?.customBlocks) {
    const { user } = await getSession();
    await prisma.pageVersion.create({
      data: {
        orgId: org.id,
        pageId: existingPage.id,
        blocks: existingPage.customBlocks as never,
        publishedById: user?.id ?? null,
      },
    });
  }

  await prisma.page.upsert({
    where: { orgId: org.id },
    create: {
      orgId: org.id,
      customBlocks: blocks as never,
      draftBlocks: undefined,
    },
    update: { customBlocks: blocks as never, draftBlocks: undefined },
  });

  revalidatePath(`/o/${parsed.data.orgSlug}`);
  revalidatePath(`/o/${parsed.data.orgSlug}/admin/site`);
  // Invalidate the cached homepage shell so the next visit re-renders
  // with the new blocks. Live widgets (events / photos / announcements)
  // self-refresh from /api/public.
  updateTag("org-home-shell");
}

export async function revertDraftBlocks(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const org = await authorize(orgSlug);
  await prisma.page.update({
    where: { orgId: org.id },
    data: { draftBlocks: undefined },
  });
  revalidatePath(`/o/${orgSlug}/admin/site`);
}
