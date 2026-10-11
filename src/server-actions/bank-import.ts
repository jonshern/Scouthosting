"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import {
  parseCsv,
  guessColumnMap,
  applyColumnMap,
} from "@/lib/treasury/bank-import";

const Schema = z.object({
  orgSlug: z.string().min(1),
  filename: z.string().trim().min(1).max(200),
  csv: z.string().min(1).max(2_000_000),
  format: z.string().trim().max(40).optional().or(z.literal("")),
});

export type BankImportState =
  | { ok: true; importId: string; rowCount: number; warnings: string[] }
  | { error: string }
  | null;

export async function uploadBankCsv(
  _prev: BankImportState,
  formData: FormData,
): Promise<BankImportState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };
  const org = await prisma.org.findUnique({ where: { slug: parsed.data.orgSlug } });
  if (!org) return { error: "Org not found." };
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) return { error: "Not authorized." };

  const rows = parseCsv(parsed.data.csv);
  if (rows.length < 2) return { error: "CSV looks empty." };
  const map = guessColumnMap(rows[0]!);
  if (!map) {
    return {
      error:
        "Couldn't detect date / amount / description columns. Rename your headers (e.g. Date, Amount, Description) and re-upload.",
    };
  }

  const { rows: parsedRows, warnings } = applyColumnMap(rows, map, true);
  if (parsedRows.length === 0) return { error: "No usable rows after parse." };

  const importRecord = await prisma.bankImport.create({
    data: {
      orgId: org.id,
      filename: parsed.data.filename,
      format: parsed.data.format || "csv-generic",
      uploadedById: user.id,
      rows: {
        create: parsedRows.map((r) => ({
          postedAt: r.postedAt,
          amountCents: r.amountCents,
          description: r.description,
        })),
      },
    },
  });

  audit({
    orgId: org.id,
    userId: user.id,
    userDisplay: user.displayName,
    entityType: "BankImport",
    entityId: importRecord.id,
    action: "create",
    summary: `Uploaded ${parsedRows.length} bank rows from ${parsed.data.filename}`,
  });

  revalidatePath(`/o/${org.slug}/admin/treasury/reconcile`);
  return { ok: true, importId: importRecord.id, rowCount: parsedRows.length, warnings };
}

const MatchSchema = z.object({
  orgSlug: z.string().min(1),
  rowId: z.string().min(1),
  txnId: z.string().min(1),
});

export async function matchBankRow(
  _prev: { ok?: true; error?: string } | null,
  formData: FormData,
): Promise<{ ok?: true; error?: string } | null> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = MatchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };
  const org = await prisma.org.findUnique({ where: { slug: parsed.data.orgSlug } });
  if (!org) return { error: "Org not found." };
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) return { error: "Not authorized." };

  const row = await prisma.bankImportRow.findUnique({
    where: { id: parsed.data.rowId },
    include: { import: true },
  });
  if (!row || row.import.orgId !== org.id) return { error: "Row not found." };

  const txn = await prisma.transaction.findUnique({
    where: { id: parsed.data.txnId },
  });
  if (!txn || txn.orgId !== org.id) return { error: "Transaction not found." };

  await prisma.$transaction([
    prisma.bankImportRow.update({
      where: { id: row.id },
      data: { matchedAt: new Date() },
    }),
    prisma.transaction.update({
      where: { id: txn.id },
      data: { bankImportRowId: row.id },
    }),
  ]);
  audit({
    orgId: org.id,
    userId: user.id,
    userDisplay: user.displayName,
    entityType: "BankImportRow",
    entityId: row.id,
    action: "update",
    summary: `Matched bank row ${row.id.slice(0, 8)} ↔ txn ${txn.id.slice(0, 8)}`,
  });
  revalidatePath(`/o/${org.slug}/admin/treasury/reconcile`);
  return { ok: true };
}
