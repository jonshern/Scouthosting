"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { isLeaderRole, roleInOrg } from "@/lib/auth/role";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import { audit } from "@/lib/audit";
import { parseAdvancementCsv } from "@/lib/scoutbook/csv";
import { applyAdvancementRows } from "@/lib/scoutbook/apply";

const ImportSchema = z.object({
  orgSlug: z.string().min(1),
  csv: z.string().min(1).max(5_000_000),
});

export type ScoutbookImportState =
  | {
      ok: true;
      runId: string;
      rowsSeen: number;
      rowsApplied: number;
      unmatched: { scoutbookUserId: string; firstName?: string; lastName?: string }[];
      warnings: string[];
    }
  | { error: string }
  | null;

export async function importScoutbookCsv(
  _prev: ScoutbookImportState,
  formData: FormData,
): Promise<ScoutbookImportState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = ImportSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };
  const org = await prisma.org.findUnique({ where: { slug: parsed.data.orgSlug } });
  if (!org) return { error: "Org not found." };
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) return { error: "Not authorized." };

  const { rows, warnings } = parseAdvancementCsv(parsed.data.csv);
  if (rows.length === 0) {
    return { error: warnings[0] ?? "No usable rows found in CSV." };
  }

  const run = await prisma.scoutbookSyncRun.create({
    data: {
      orgId: org.id,
      source: "csv",
      rowsSeen: rows.length,
    },
  });

  let result;
  try {
    result = await applyAdvancementRows({ orgId: org.id, rows });
  } catch (e) {
    await prisma.scoutbookSyncRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), errorMessage: (e as Error).message },
    });
    return { error: (e as Error).message };
  }

  await prisma.scoutbookSyncRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      rowsApplied: result.rowsApplied,
      warnings: [...warnings, ...result.warnings],
    },
  });

  audit({
    orgId: org.id,
    userId: user.id,
    userDisplay: user.displayName,
    entityType: "ScoutbookSync",
    entityId: run.id,
    action: "create",
    summary: `CSV import: ${result.rowsApplied}/${result.rowsSeen} applied; ${result.unmatched.length} unmatched`,
  });

  revalidatePath(`/o/${org.slug}/admin/scoutbook`);
  return {
    ok: true,
    runId: run.id,
    rowsSeen: result.rowsSeen,
    rowsApplied: result.rowsApplied,
    unmatched: result.unmatched,
    warnings: [...warnings, ...result.warnings],
  };
}

const LinkSchema = z.object({
  orgSlug: z.string().min(1),
  memberId: z.string().min(1),
  scoutbookUserId: z.string().trim().min(1).max(40),
});

export async function linkScoutbookId(
  _prev: { ok?: true; error?: string } | null,
  formData: FormData,
): Promise<{ ok?: true; error?: string } | null> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) return { error: "Bad CSRF." };
  const parsed = LinkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid input." };
  const { user } = await getSession();
  if (!user) return { error: "Not signed in." };
  const org = await prisma.org.findUnique({ where: { slug: parsed.data.orgSlug } });
  if (!org) return { error: "Org not found." };
  const role = await roleInOrg(user.id, org.id);
  if (!isLeaderRole(role) && !user.isSuperAdmin) return { error: "Not authorized." };

  const member = await prisma.member.findUnique({ where: { id: parsed.data.memberId } });
  if (!member || member.orgId !== org.id) return { error: "Member not found." };

  await prisma.member.update({
    where: { id: member.id },
    data: { scoutbookUserId: parsed.data.scoutbookUserId },
  });
  audit({
    orgId: org.id,
    userId: user.id,
    userDisplay: user.displayName,
    entityType: "Member",
    entityId: member.id,
    action: "update",
    summary: `Linked Scoutbook user ${parsed.data.scoutbookUserId}`,
  });
  revalidatePath(`/o/${org.slug}/admin/scoutbook`);
  return { ok: true };
}
