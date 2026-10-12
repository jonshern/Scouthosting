"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { canManageTreasury, TREASURY_FORBIDDEN } from "@/lib/auth/treasury-access";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { postWithin, type Tx } from "@/lib/treasury/posting";
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
  if (!(await canManageTreasury(user, org.id))) throw new Error(TREASURY_FORBIDDEN);

  const row = await prisma.reimbursement.findUnique({
    where: { id, orgId: org.id },
  });
  if (!row) throw new Error("Not found.");

  // Treasury wire-up: when a reimbursement is approved, post an
  // expense Transaction against the org's general fund. The status
  // change and the posting share one transaction, and the change only
  // applies if the row still isn't "approved", so two treasurers (or a
  // double-click) can't post the expense twice. Approving again after
  // moving it back to pending doesn't post a second expense while the
  // first is still unreversed. Denial after approval isn't reversed here
  // (the treasurer reverses the expense on the ledger); paid is
  // informational.
  const fund =
    status === "approved"
      ? await prisma.fund.findUnique({ where: { orgId_code: { orgId: org.id, code: GENERAL_FUND } } })
      : null;
  const postedId = await prisma.$transaction(async (stx) => {
    const tx = stx as unknown as Tx;
    const changed = await stx.reimbursement.updateMany({
      where: status === "approved" ? { id, orgId: org.id, status: { not: "approved" } } : { id, orgId: org.id },
      data: {
        status,
        decidedAt: new Date(),
        decidedByUserId: user.id,
        decidedByDisplay: user.displayName,
      },
    });
    if (status !== "approved" || changed.count === 0 || !fund) return null;
    const open = await stx.transaction.findFirst({
      where: { reimbursementId: row.id, type: "expense", reversedBy: { none: {} } },
      select: { id: true },
    });
    if (open) return null;
    const posted = await postWithin(tx, {
      orgId: org.id,
      fundId: fund.id,
      type: "expense",
      amountCents: -row.amountCents,
      description: `Reimbursement: ${row.purpose} (${row.requesterName})`,
      eventId: row.eventId,
      reimbursementId: row.id,
      createdById: user.id,
    });
    return posted.id;
  });
  if (postedId) {
    audit({
      orgId: org.id,
      userId: user.id,
      userDisplay: user.displayName,
      entityType: "Transaction",
      entityId: postedId,
      action: "create",
      summary: `Reimbursement #${row.id.slice(0, 8)} approved → expense`,
    });
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
