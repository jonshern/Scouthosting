"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { postTransaction } from "@/lib/treasury/posting";
import { GENERAL_FUND } from "@/lib/treasury/money";

const STATUSES = new Set(["pending", "approved", "denied", "paid"]);

export async function setReimbursementStatus(formData: FormData): Promise<void> {
  if (!(await verifyOrigin())) throw new Error("Bad origin.");
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) throw new Error("Bad CSRF.");
  const { user } = await getSession();
  if (!user) redirect("/login");
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!STATUSES.has(status)) throw new Error("Bad status.");

  const org = await prisma.org.findUnique({ where: { slug: orgSlug } });
  if (!org) throw new Error("Org not found.");
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) throw new Error("Forbidden.");

  const row = await prisma.reimbursement.findUnique({
    where: { id, orgId: org.id },
  });
  if (!row) throw new Error("Not found.");

  await prisma.reimbursement.update({
    where: { id },
    data: {
      status,
      decidedAt: new Date(),
      decidedByUserId: user.id,
      decidedByDisplay: user.displayName,
    },
  });

  // Treasury wire-up: when a reimbursement is approved, post an
  // expense Transaction against the org's general fund. We do not
  // reverse on denial after approval (handled manually by the
  // treasurer); paid is informational and does not double-post.
  if (status === "approved" && row.status !== "approved") {
    const fund = await prisma.fund.findUnique({
      where: { orgId_code: { orgId: org.id, code: GENERAL_FUND } },
    });
    if (fund) {
      try {
        const tx = await postTransaction({
          orgId: org.id,
          fundId: fund.id,
          type: "expense",
          amountCents: -row.amountCents,
          description: `Reimbursement: ${row.purpose} (${row.requesterName})`,
          eventId: row.eventId,
          reimbursementId: row.id,
          createdById: user.id,
        });
        audit({
          orgId: org.id,
          userId: user.id,
          userDisplay: user.displayName,
          entityType: "Transaction",
          entityId: tx.id,
          action: "create",
          summary: `Reimbursement #${row.id.slice(0, 8)} approved → expense`,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("reimbursement → ledger post failed", e);
      }
    }
  }

  audit({
    orgId: org.id,
    userId: user.id,
    userDisplay: user.displayName,
    entityType: "Reimbursement",
    entityId: row.id,
    action: "update",
    summary: `Status: ${row.status} → ${status}`,
  });

  redirect(`/o/${orgSlug}/admin/reimbursements`);
}
