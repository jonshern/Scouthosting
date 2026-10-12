"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type FeedbackKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { roleInOrg } from "@/lib/auth/role";

const KINDS = new Set<FeedbackKind>(["feature", "bug", "help"]);

const SubmitSchema = z.object({
  orgSlug: z.string().min(1),
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(3).max(8000),
  kind: z.string().min(1),
});

export async function submitFeedback(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const { user } = await getSession();
  if (!user) throw new Error("Sign in.");
  const parsed = SubmitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input.");
  const kind: FeedbackKind = KINDS.has(parsed.data.kind as FeedbackKind)
    ? (parsed.data.kind as FeedbackKind)
    : "feature";

  const org = await prisma.org.findUnique({ where: { slug: parsed.data.orgSlug } });
  if (!org) throw new Error("Org not found.");
  if (!(await roleInOrg(user.id, org.id)) && !user.isSuperAdmin) throw new Error("Not authorized.");

  await prisma.feedbackRequest.create({
    data: {
      orgId: org.id,
      userId: user.id,
      authorEmail: user.email,
      authorName: user.displayName,
      title: parsed.data.title,
      body: parsed.data.body,
      kind,
      scope: "org",
      status: "submitted",
    },
  });
  revalidatePath(`/o/${parsed.data.orgSlug}/feedback`);
}

const VoteSchema = z.object({
  orgSlug: z.string().min(1),
  id: z.string().min(1),
});

export async function toggleFeedbackVote(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const { user } = await getSession();
  if (!user) throw new Error("Sign in.");
  const parsed = VoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid input.");

  // Org-scoped requests are votable only by members of that org;
  // global (product-wide) requests by anyone signed in.
  const request = await prisma.feedbackRequest.findUnique({
    where: { id: parsed.data.id },
    select: { orgId: true, scope: true },
  });
  if (!request) throw new Error("Request not found.");
  if (request.scope !== "global") {
    if (!request.orgId || !(await roleInOrg(user.id, request.orgId))) {
      throw new Error("Not a member.");
    }
  }

  const existing = await prisma.feedbackVote.findUnique({
    where: { requestId_userId: { requestId: parsed.data.id, userId: user.id } },
  });

  if (existing) {
    await prisma.$transaction([
      prisma.feedbackVote.delete({
        where: {
          requestId_userId: { requestId: parsed.data.id, userId: user.id },
        },
      }),
      prisma.feedbackRequest.update({
        where: { id: parsed.data.id },
        data: { voteCount: { decrement: 1 } },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.feedbackVote.create({
        data: { requestId: parsed.data.id, userId: user.id },
      }),
      prisma.feedbackRequest.update({
        where: { id: parsed.data.id },
        data: { voteCount: { increment: 1 } },
      }),
    ]);
  }
  revalidatePath(`/o/${parsed.data.orgSlug}/feedback`);
}
