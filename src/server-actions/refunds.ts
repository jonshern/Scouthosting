"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { canManageTreasury, TREASURY_FORBIDDEN } from "@/lib/auth/treasury-access";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";

const RefundSchema = z.object({
  orgSlug: z.string().min(1),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a positive dollar value."),
  reason: z.string().trim().min(1).max(500),
  paymentRef: z.string().trim().max(200).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function issueRefund(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const { user } = await getSession();
  if (!user) throw new Error("Sign in.");
  const parsed = RefundSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input.");

  const org = await prisma.org.findUnique({ where: { slug: parsed.data.orgSlug } });
  if (!org) throw new Error("Org not found.");
  if (!(await canManageTreasury(user, org.id))) throw new Error(TREASURY_FORBIDDEN);

  const amountCents = Math.round(parseFloat(parsed.data.amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("Amount must be greater than zero.");
  }

  const refund = await prisma.refund.create({
    data: {
      orgId: org.id,
      paymentRef: parsed.data.paymentRef || null,
      amountCents,
      reason: parsed.data.reason,
      issuedBy: user.id,
      status: "issued",
      notes: parsed.data.notes || null,
    },
  });
  audit({
    orgId: org.id,
    userId: user.id,
    userDisplay: user.displayName,
    entityType: "Refund",
    entityId: refund.id,
    action: "refund.issue",
    summary: `$${parsed.data.amount} — ${parsed.data.reason.slice(0, 100)}`,
  });
  redirect(`/o/${parsed.data.orgSlug}/admin/refunds`);
}
