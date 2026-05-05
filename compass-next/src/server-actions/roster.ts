"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/lucia";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import {
  parseRoster,
  mapMemberRows,
  planRosterImport,
  type RosterRow,
  type ExistingMember,
  type ImportPlan,
} from "@/lib/roster/import";

export type RosterImportState =
  | null
  | { error: string }
  | {
      preview: {
        creates: number;
        updates: number;
        unchanged: number;
        conflicts: Array<{ firstName: string; lastName: string; reason: string }>;
      };
    }
  | {
      committed: true;
      created: number;
      updated: number;
      unchanged: number;
    };

async function authorize(
  orgSlug: string,
): Promise<{ error: string } | { org: { id: string; slug: string } }> {
  const { user } = await getSession();
  if (!user) return { error: "Sign in." };
  const org = await prisma.org.findUnique({
    where: { slug: orgSlug },
    select: { id: true, slug: true },
  });
  if (!org) return { error: "Org not found." };
  const m = await prisma.orgMembership.findFirst({
    where: { orgId: org.id, userId: user.id },
    select: { role: true },
  });
  if (!m || (m.role !== "leader" && m.role !== "admin")) {
    return { error: "Forbidden." };
  }
  return { org };
}

async function loadInputRows(formData: FormData, orgId: string): Promise<RosterRow[] | { error: string }> {
  const file = formData.get("file");
  const text = String(formData.get("text") ?? "");
  let buffer: Buffer | undefined;
  let filename: string | undefined;
  if (file instanceof File && file.size > 0) {
    buffer = Buffer.from(await file.arrayBuffer());
    filename = file.name;
  }
  if (!buffer && !text.trim()) return { error: "Upload a file or paste CSV." };

  let matrix: string[][];
  try {
    matrix = parseRoster({ buffer, filename, text: text || undefined });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't parse upload." };
  }
  return mapMemberRows({ rows: matrix, orgId });
}

async function buildPlan(
  rows: RosterRow[],
  orgId: string,
): Promise<ImportPlan> {
  const existing = await prisma.member.findMany({
    where: { orgId },
    select: {
      id: true,
      orgId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      patrol: true,
      position: true,
      isYouth: true,
      commPreference: true,
      smsOptIn: true,
      skills: true,
      interests: true,
      notes: true,
      deletedAt: true,
    },
  });
  return planRosterImport({
    rows,
    existing: existing as unknown as ExistingMember[],
  });
}

export async function runRosterImport(
  _prev: RosterImportState,
  formData: FormData,
): Promise<RosterImportState> {
  if (!(await verifyOrigin())) return { error: "Bad origin." };
  if (!(await verifyCsrf(String(formData.get("_csrf") ?? "")))) {
    return { error: "Bad CSRF token." };
  }

  const orgSlug = String(formData.get("orgSlug") ?? "");
  const auth = await authorize(orgSlug);
  if ("error" in auth) return { error: auth.error };

  const rowsOrErr = await loadInputRows(formData, auth.org.id);
  if (!Array.isArray(rowsOrErr)) return rowsOrErr;
  const rows = rowsOrErr;

  const plan = await buildPlan(rows, auth.org.id);
  const mode = String(formData.get("mode") ?? "preview");

  if (mode !== "commit") {
    return {
      preview: {
        creates: plan.creates.length,
        updates: plan.updates.length,
        unchanged: plan.unchanged.length,
        conflicts: plan.conflicts.map((c) => ({
          firstName: c.row.firstName,
          lastName: c.row.lastName,
          reason: c.reason,
        })),
      },
    };
  }

  // Commit phase.
  let created = 0;
  let updated = 0;
  if (plan.creates.length) {
    const result = await prisma.member.createMany({
      data: plan.creates.map((r) => ({
        orgId: r.orgId,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
        patrol: r.patrol,
        position: r.position,
        isYouth: r.isYouth,
        commPreference: r.commPreference,
        smsOptIn: r.smsOptIn,
        skills: r.skills,
        interests: r.interests,
        notes: r.notes,
      })),
      skipDuplicates: true,
    });
    created = result.count;
  }
  for (const u of plan.updates) {
    await prisma.member.update({ where: { id: u.id }, data: u.data });
    updated++;
  }
  revalidatePath(`/o/${orgSlug}/admin/members`);
  return {
    committed: true,
    created,
    updated,
    unchanged: plan.unchanged.length,
  };
}
