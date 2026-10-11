"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import {
  buildEmailAudience,
  describeAudience,
  type AudienceKind,
} from "@/lib/mail/audience";
import { sendLoggedBroadcast } from "@/lib/mail/broadcast";

const BroadcastInput = z.object({
  orgSlug: z.string().min(1),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(50_000),
  audienceKind: z.enum(["everyone", "adults", "youth", "leaders", "patrol"]),
  audiencePatrol: z.string().trim().max(50).optional().or(z.literal("")),
  dryRun: z.union([z.literal("on"), z.literal("")]).optional(),
});

export type BroadcastState =
  | null
  | { error: string }
  | { ok: true; mailLogId: string; recipientCount: number; deliveredCount: number; failedCount: number; dryRun: boolean };

type AuthOk = {
  user: NonNullable<Awaited<ReturnType<typeof getSession>>["user"]>;
  org: NonNullable<Awaited<ReturnType<typeof prisma.org.findUnique>>>;
};
type AuthErr = { error: string };

async function authorize(orgSlug: string): Promise<AuthOk | AuthErr> {
  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };
  const org = await prisma.org.findUnique({ where: { slug: orgSlug } });
  if (!org) return { error: "Site not found." };
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) return { error: "Not authorized." };
  return { user, org };
}

export async function sendBroadcast(_prev: BroadcastState, formData: FormData): Promise<BroadcastState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = BroadcastInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const auth = await authorize(parsed.data.orgSlug);
  if ("error" in auth) return { error: auth.error };
  const d = parsed.data;
  const dryRun = d.dryRun === "on";
  const selector = {
    kind: d.audienceKind as AudienceKind,
    patrol: d.audiencePatrol || null,
  };

  const recipients = await buildEmailAudience(auth.org.id, selector);
  const audienceLabel = describeAudience(selector);

  const result = await sendLoggedBroadcast({
    orgId: auth.org.id,
    author: auth.user,
    subject: d.subject,
    body: d.body,
    audienceLabel,
    recipients,
    dryRun,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/email`);
  return {
    ok: true,
    mailLogId: result.mailLogId,
    recipientCount: result.recipientCount,
    deliveredCount: result.deliveredCount,
    failedCount: result.failedCount,
    dryRun: result.dryRun,
  };
}
