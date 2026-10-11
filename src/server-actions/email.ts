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
import { sendMail } from "@/lib/mail";
import { renderMarkdownLite } from "@/lib/markdown";
import { audit } from "@/lib/audit";

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

  const html = renderMarkdownLite(d.body);

  // Snapshot the recipient list at compose time so the MailLog reflects who
  // we *intended* to send to, even if directory rows mutate afterward.
  const recipientSnapshot = recipients.map((r) => ({
    name: r.name,
    email: r.email,
    phone: r.phone ?? null,
    channel: "email" as const,
  }));

  const mailLog = await prisma.mailLog.create({
    data: {
      orgId: auth.org.id,
      authorId: auth.user.id,
      subject: d.subject,
      body: d.body,
      channel: "email",
      audienceLabel,
      recipientCount: recipients.length,
      deliveredCount: 0,
      failedCount: 0,
      status: dryRun ? "dryrun" : "queued",
      recipients: recipientSnapshot,
    },
  });

  if (dryRun || recipients.length === 0) {
    audit({
      orgId: auth.org.id,
      userId: auth.user.id,
      userDisplay: auth.user.displayName,
      entityType: "MailLog",
      entityId: mailLog.id,
      action: "create",
      summary: dryRun
        ? `Dry-run “${d.subject}” to ${audienceLabel} (${recipients.length})`
        : `Composed “${d.subject}” to ${audienceLabel} (no recipients)`,
    });
    revalidatePath(`/o/${auth.org.slug}/admin/email`);
    return {
      ok: true,
      mailLogId: mailLog.id,
      recipientCount: recipients.length,
      deliveredCount: 0,
      failedCount: 0,
      dryRun,
    };
  }

  // Synchronous fan-out (in-process). When the pg-boss port lands these
  // rows go on a queue and a worker fans out; until then we send inline
  // so admins see end-to-end behaviour.
  let delivered = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const r of recipients) {
    const result = await sendMail({
      to: r.email,
      toName: r.name,
      subject: d.subject,
      html,
    });
    if (result.ok) delivered += 1;
    else {
      failed += 1;
      if (errors.length < 5) errors.push(`${r.email}: ${result.error}`);
    }
  }

  const status = failed === 0 ? "sent" : delivered === 0 ? "failed" : "partial";
  await prisma.mailLog.update({
    where: { id: mailLog.id },
    data: {
      deliveredCount: delivered,
      failedCount: failed,
      status,
      errors: errors.length ? errors.join("\n") : null,
    },
  });

  audit({
    orgId: auth.org.id,
    userId: auth.user.id,
    userDisplay: auth.user.displayName,
    entityType: "MailLog",
    entityId: mailLog.id,
    action: "create",
    summary: `Sent “${d.subject}” to ${audienceLabel} (${delivered}/${recipients.length})`,
  });
  revalidatePath(`/o/${auth.org.slug}/admin/email`);
  return {
    ok: true,
    mailLogId: mailLog.id,
    recipientCount: recipients.length,
    deliveredCount: delivered,
    failedCount: failed,
    dryRun: false,
  };
}
