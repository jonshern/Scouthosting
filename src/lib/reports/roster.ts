// Lightweight report queries that decrypt the relevant Member PII once
// per page render. Each helper returns a flat array shape suited to
// table rendering. Reports are admin-gated at the layout level; we do
// not enforce auth here.

import type { Org } from "@prisma/client";
import { prisma } from "@/lib/db";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";

type Base = {
  memberId: string;
  name: string;
  isYouth: boolean;
  patrol: string | null;
};

export type DietaryRow = Base & { flags: string[]; notes: string | null };
export type BirthdayRow = Base & { birthdate: Date; ageNow: number; nextBirthday: Date };
export type ShirtSizeRow = Base & { shirtSize: string | null };
export type AgeBucketRow = Base & {
  birthdate: Date | null;
  ageYears: number | null;
};

function decorate<T extends Base>(rows: T[]): T[] {
  rows.sort((a, b) => {
    if (a.isYouth !== b.isYouth) return a.isYouth ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return rows;
}

async function loadActiveMembers(org: Pick<Org, "id" | "encryptedDek">) {
  if (!org.encryptedDek) return [];
  const rows = await prisma.member.findMany({
    where: { orgId: org.id, deletedAt: null, status: { not: "alumni" } },
  });
  const dek = unwrapDekWithMaster(org);
  return rows.map((m) => {
    const pii = decryptMemberPii(m, dek, org.id);
    return {
      ...m,
      name: `${pii.firstName} ${pii.lastName}`.trim(),
    };
  });
}

export async function dietaryReport(org: Pick<Org, "id" | "encryptedDek">): Promise<DietaryRow[]> {
  const members = await loadActiveMembers(org);
  const out = members
    .filter((m) => m.dietaryFlags.length > 0 || (m.notes ?? "").trim().length > 0)
    .map((m) => ({
      memberId: m.id,
      name: m.name,
      isYouth: m.isYouth,
      patrol: m.patrol,
      flags: m.dietaryFlags,
      notes: m.notes,
    }));
  return decorate(out);
}

export async function birthdayReport(org: Pick<Org, "id" | "encryptedDek">): Promise<BirthdayRow[]> {
  const members = await loadActiveMembers(org);
  const today = new Date();
  const out = members
    .filter((m) => m.birthdate)
    .map((m) => {
      const bd = m.birthdate!;
      const next = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
      if (next < today) next.setFullYear(today.getFullYear() + 1);
      const age = today.getFullYear() - bd.getFullYear() - (
        today.getMonth() < bd.getMonth() ||
        (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())
          ? 1
          : 0
      );
      return {
        memberId: m.id,
        name: m.name,
        isYouth: m.isYouth,
        patrol: m.patrol,
        birthdate: bd,
        ageNow: age,
        nextBirthday: next,
      };
    });
  out.sort((a, b) => a.nextBirthday.getTime() - b.nextBirthday.getTime());
  return out;
}

export async function shirtSizeReport(org: Pick<Org, "id" | "encryptedDek">): Promise<ShirtSizeRow[]> {
  const members = await loadActiveMembers(org);
  const out = members.map((m) => ({
    memberId: m.id,
    name: m.name,
    isYouth: m.isYouth,
    patrol: m.patrol,
    shirtSize: m.shirtSize,
  }));
  return decorate(out);
}

export async function scoutsByAgeReport(org: Pick<Org, "id" | "encryptedDek">): Promise<AgeBucketRow[]> {
  const members = await loadActiveMembers(org);
  const today = new Date();
  const out = members
    .filter((m) => m.isYouth)
    .map((m) => {
      const bd = m.birthdate ?? null;
      const ageYears = bd
        ? today.getFullYear() - bd.getFullYear() - (
            today.getMonth() < bd.getMonth() ||
            (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())
              ? 1
              : 0
          )
        : null;
      return {
        memberId: m.id,
        name: m.name,
        isYouth: true,
        patrol: m.patrol,
        birthdate: bd,
        ageYears,
      };
    });
  out.sort((a, b) => {
    if (a.ageYears == null) return 1;
    if (b.ageYears == null) return -1;
    return a.ageYears - b.ageYears || a.name.localeCompare(b.name);
  });
  return out;
}
