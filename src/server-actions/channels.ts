"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { suspendChannel, unsuspendChannel } from "@/lib/chat";
import { publishArchived } from "@/lib/realtime/bus";

// The admin channels page redirects back to itself, so the router would
// keep showing the cached copy without this.
function refreshChannelPages(orgSlug: string) {
  revalidatePath(`/o/${orgSlug}/admin/channels`);
  revalidatePath(`/o/${orgSlug}/chat`);
}

async function authorizeChannelAdmin(orgSlug: string, channelId: string) {
  const { user } = await getSession();
  if (!user) return { error: "Sign in." } as const;
  const org = await prisma.org.findUnique({ where: { slug: orgSlug } });
  if (!org) return { error: "Org not found." } as const;
  const membership = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!membership || (membership.role !== "leader" && membership.role !== "admin")) {
    return { error: "Forbidden." } as const;
  }
  const channel = await prisma.channel.findFirst({
    where: { id: channelId, orgId: org.id },
    select: { id: true },
  });
  if (!channel) return { error: "Channel not found." } as const;
  return { org, user, channel } as const;
}

export async function suspendChannelAction(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const channelId = String(formData.get("channelId") ?? "");
  const reason = String(formData.get("reason") ?? "manual");
  const auth = await authorizeChannelAdmin(orgSlug, channelId);
  if ("error" in auth) throw new Error(auth.error);
  await suspendChannel(channelId, reason, {
    prismaClient: prisma,
    org: auth.org,
    user: auth.user,
  });
  refreshChannelPages(orgSlug);
  redirect(`/o/${orgSlug}/admin/channels`);
}

export async function unsuspendChannelAction(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const channelId = String(formData.get("channelId") ?? "");
  const auth = await authorizeChannelAdmin(orgSlug, channelId);
  if ("error" in auth) throw new Error(auth.error);
  const result = await unsuspendChannel(channelId, {
    prismaClient: prisma,
    org: auth.org,
    user: auth.user,
  });
  refreshChannelPages(orgSlug);
  if (!result.ok) {
    redirect(`/o/${orgSlug}/admin/channels?error=${encodeURIComponent(result.reason)}`);
  }
  redirect(`/o/${orgSlug}/admin/channels`);
}

export async function archiveChannelAction(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const channelId = String(formData.get("channelId") ?? "");
  const auth = await authorizeChannelAdmin(orgSlug, channelId);
  if ("error" in auth) throw new Error(auth.error);
  await prisma.channel.update({
    where: { id: channelId },
    data: { archivedAt: new Date() },
  });
  try {
    publishArchived(channelId);
  } catch {
    // ignore
  }
  refreshChannelPages(orgSlug);
  redirect(`/o/${orgSlug}/admin/channels`);
}
