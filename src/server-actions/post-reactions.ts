"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { decideToggle, normaliseReactionKind } from "@/lib/posts/reactions";
import { roleInOrg } from "@/lib/auth/role";

export async function togglePostReaction(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const { user } = await getSession();
  if (!user) throw new Error("Sign in.");
  const postId = String(formData.get("postId") ?? "");
  const kind = normaliseReactionKind(String(formData.get("kind") ?? ""));
  if (!postId) throw new Error("Missing postId.");
  const orgSlug = String(formData.get("orgSlug") ?? "");

  // Only members of the post's unit can react (members-only posts
  // included).
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { orgId: true } });
  if (!post) throw new Error("Post not found.");
  if (!(await roleInOrg(user.id, post.orgId)) && !user.isSuperAdmin) {
    throw new Error("Not a member.");
  }

  const existing = await prisma.postReaction.findUnique({
    where: { postId_userId_kind: { postId, userId: user.id, kind } },
  });
  const op = decideToggle({ existing, kind });
  if (op === "insert") {
    await prisma.postReaction.create({
      data: { postId, userId: user.id, kind },
    });
  } else if (existing) {
    await prisma.postReaction.delete({
      where: { postId_userId_kind: { postId, userId: user.id, kind } },
    });
  }
  if (orgSlug) revalidatePath(`/o/${orgSlug}/posts/${postId}`);
}
