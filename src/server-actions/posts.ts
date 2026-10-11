"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";

type AuthOk = {
  user: NonNullable<Awaited<ReturnType<typeof getSession>>["user"]>;
  org: NonNullable<Awaited<ReturnType<typeof prisma.org.findUnique>>>;
};
type AuthErr = { error: string };

async function authorizeLeader(orgSlug: string): Promise<AuthOk | AuthErr> {
  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };
  const org = await prisma.org.findUnique({ where: { slug: orgSlug } });
  if (!org) return { error: "Site not found." };
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) return { error: "Not authorized." };
  return { user, org };
}

async function authorizeMember(orgSlug: string): Promise<AuthOk | AuthErr> {
  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };
  const org = await prisma.org.findUnique({ where: { slug: orgSlug } });
  if (!org) return { error: "Site not found." };
  const role = await roleInOrg(user.id, org.id);
  if (!role && !user.isSuperAdmin) return { error: "Not a member." };
  return { user, org };
}

const PostInput = z.object({
  orgSlug: z.string().min(1),
  id: z.string().optional(),
  title: z.string().trim().max(200).optional().or(z.literal("")),
  body: z.string().trim().min(1).max(50_000),
  visibility: z.enum(["public", "members"]).default("public"),
  pinned: z.union([z.literal("on"), z.literal("")]).optional(),
});

export type PostState = { error?: string; ok?: true } | null;

export async function upsertPost(_prev: PostState, formData: FormData): Promise<PostState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = PostInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const d = parsed.data;
  const data = {
    orgId: auth.org.id,
    authorId: auth.user.id,
    title: d.title?.trim() || null,
    body: d.body,
    visibility: d.visibility,
    pinned: d.pinned === "on",
  };
  if (d.id) {
    const existing = await prisma.post.findUnique({ where: { id: d.id } });
    if (!existing || existing.orgId !== auth.org.id) return { error: "Post not found." };
    await prisma.post.update({ where: { id: existing.id }, data });
    audit({
      orgId: auth.org.id,
      userId: auth.user.id,
      userDisplay: auth.user.displayName,
      entityType: "Post",
      entityId: existing.id,
      action: "update",
      summary: `Updated post`,
    });
  } else {
    const created = await prisma.post.create({ data });
    audit({
      orgId: auth.org.id,
      userId: auth.user.id,
      userDisplay: auth.user.displayName,
      entityType: "Post",
      entityId: created.id,
      action: "create",
      summary: d.title ? `Posted “${d.title}”` : `Posted update`,
    });
  }
  revalidatePath(`/o/${auth.org.slug}/posts`);
  revalidatePath(`/o/${auth.org.slug}/admin/posts`);
  redirect(`/o/${auth.org.slug}/admin/posts`);
}

const DeletePostSchema = z.object({ orgSlug: z.string().min(1), id: z.string().min(1) });

export async function deletePost(_prev: unknown, formData: FormData) {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = DeletePostSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authorizeLeader(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const post = await prisma.post.findUnique({ where: { id: parsed.data.id } });
  if (!post || post.orgId !== auth.org.id) return { error: "Post not found." };
  await prisma.post.delete({ where: { id: post.id } });
  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "Post",
    entityId: post.id,
    action: "delete",
    summary: post.title ? `Deleted post “${post.title}”` : "Deleted post",
  });
  revalidatePath(`/o/${auth.org.slug}/posts`);
  revalidatePath(`/o/${auth.org.slug}/admin/posts`);
  redirect(`/o/${auth.org.slug}/admin/posts`);
}

const CommentSchema = z.object({
  orgSlug: z.string().min(1),
  postId: z.string().min(1),
  body: z.string().trim().min(1).max(5000),
});

export async function addComment(_prev: unknown, formData: FormData) {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = CommentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorizeMember(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const post = await prisma.post.findUnique({ where: { id: parsed.data.postId } });
  if (!post || post.orgId !== auth.org.id) return { error: "Post not found." };
  await prisma.comment.create({
    data: {
      orgId: auth.org.id,
      postId: post.id,
      authorId: auth.user.id,
      body: parsed.data.body,
    },
  });
  revalidatePath(`/o/${auth.org.slug}/posts/${post.id}`);
  return { ok: true as const };
}

const ToggleReactionSchema = z.object({
  orgSlug: z.string().min(1),
  postId: z.string().min(1),
  kind: z.enum(["like", "bookmark"]),
});

export async function toggleReaction(_prev: unknown, formData: FormData) {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = ToggleReactionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const auth = await authorizeMember(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const post = await prisma.post.findUnique({ where: { id: parsed.data.postId } });
  if (!post || post.orgId !== auth.org.id) return { error: "Post not found." };
  const composite = {
    postId_userId_kind: {
      postId: post.id,
      userId: auth.user.id,
      kind: parsed.data.kind,
    },
  } as const;
  const existing = await prisma.postReaction.findUnique({ where: composite });
  if (existing) {
    await prisma.postReaction.delete({ where: composite });
  } else {
    await prisma.postReaction.create({
      data: { postId: post.id, userId: auth.user.id, kind: parsed.data.kind },
    });
  }
  revalidatePath(`/o/${auth.org.slug}/posts/${post.id}`);
  return { ok: true as const, on: !existing };
}
