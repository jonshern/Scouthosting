"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { verifyCsrf, verifyOrigin } from "@/lib/security/csrf";
import {
  parseRoster,
  mapMemberRows,
  planRosterImport,
  type RosterRow,
  type ExistingMember,
  type ImportPlan,
} from "@/lib/roster/import";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii, encryptMemberPii } from "@/lib/members/crypto";

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

type AuthedOrg = {
  id: string;
  slug: string;
  encryptedDek: Buffer | Uint8Array | null;
};

async function authorize(
  orgSlug: string,
): Promise<{ error: string } | { org: AuthedOrg }> {
  const { user } = await getSession();
  if (!user) return { error: "Sign in." };
  const org = await prisma.org.findUnique({
    where: { slug: orgSlug },
    select: { id: true, slug: true, encryptedDek: true },
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
  org: AuthedOrg,
): Promise<ImportPlan> {
  if (!org.encryptedDek) {
    return planRosterImport({ rows, existing: [] });
  }
  const dek = unwrapDekWithMaster(org);
  const raw = await prisma.member.findMany({
    where: { orgId: org.id },
    select: {
      id: true,
      orgId: true,
      encFirstName: true,
      encLastName: true,
      encPhone: true,
      encStreet: true,
      encCity: true,
      encState: true,
      encZip: true,
      email: true,
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
  const existing: ExistingMember[] = raw.map((r) => {
    const pii = decryptMemberPii(r, dek, org.id);
    return {
      id: r.id,
      orgId: r.orgId,
      firstName: pii.firstName,
      lastName: pii.lastName,
      email: r.email,
      phone: pii.phone,
      patrol: r.patrol,
      position: r.position,
      isYouth: r.isYouth,
      commPreference: r.commPreference as ExistingMember["commPreference"],
      smsOptIn: r.smsOptIn,
      skills: r.skills,
      interests: r.interests,
      notes: r.notes,
      deletedAt: r.deletedAt ?? null,
    };
  });
  return planRosterImport({ rows, existing });
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

  if (!auth.org.encryptedDek) {
    return { error: "Org encryption vault is not provisioned." };
  }
  const plan = await buildPlan(rows, auth.org);
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

  // Commit phase. Encrypt PII before write.
  const dek = unwrapDekWithMaster(auth.org);
  let created = 0;
  let updated = 0;
  if (plan.creates.length) {
    const result = await prisma.member.createMany({
      data: plan.creates.map((r) => {
        const enc = encryptMemberPii(
          {
            firstName: r.firstName,
            lastName: r.lastName,
            phone: r.phone,
          },
          dek,
          auth.org.id,
        );
        return {
          orgId: r.orgId,
          encFirstName: enc.encFirstName,
          encLastName: enc.encLastName,
          encPhone: enc.encPhone,
          lastNameLc1: enc.lastNameLc1,
          email: r.email,
          patrol: r.patrol,
          position: r.position,
          isYouth: r.isYouth,
          commPreference: r.commPreference,
          smsOptIn: r.smsOptIn,
          skills: r.skills,
          interests: r.interests,
          notes: r.notes,
        };
      }),
      skipDuplicates: true,
    });
    created = result.count;
  }
  for (const u of plan.updates) {
    // Translate any plaintext PII fields in u.data into encrypted columns.
    const data: Record<string, unknown> = { ...u.data };
    if ("firstName" in data || "lastName" in data || "phone" in data) {
      // Need the current row to combine with partial changes.
      const current = await prisma.member.findUnique({
        where: { id: u.id },
        select: {
          encFirstName: true,
          encLastName: true,
          encPhone: true,
          encStreet: true,
          encCity: true,
          encState: true,
          encZip: true,
        },
      });
      const decrypted = current
        ? decryptMemberPii(current, dek, auth.org.id)
        : { firstName: "", lastName: "", phone: null, street: null, city: null, state: null, zip: null };
      const next = encryptMemberPii(
        {
          firstName: (data.firstName as string | undefined) ?? decrypted.firstName,
          lastName: (data.lastName as string | undefined) ?? decrypted.lastName,
          phone: ("phone" in data ? (data.phone as string | null) : decrypted.phone),
          street: decrypted.street,
          city: decrypted.city,
          state: decrypted.state,
          zip: decrypted.zip,
        },
        dek,
        auth.org.id,
      );
      delete data.firstName;
      delete data.lastName;
      delete data.phone;
      data.encFirstName = next.encFirstName;
      data.encLastName = next.encLastName;
      data.encPhone = next.encPhone;
      data.lastNameLc1 = next.lastNameLc1;
    }
    await prisma.member.update({ where: { id: u.id }, data });
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
