// DB-side helpers shared by the counselor /api/v1 routes: org and
// scout lookup that hides other orgs' rows (404), the caller's
// relation to a scout, and the minimal scout/parent views these routes
// are allowed to return.

import { prisma } from "@/lib/db";
import { decryptField, unwrapDekWithMaster } from "@/lib/encryption";
import { LEADER_ROLES, notFound, parseId, requireOrgAccessForResource, type OrgAccess } from "@/lib/api/v1";
import { lastInitial, type ScoutRelation } from "./ids";

/**
 * Org by id or slug, and the caller's role in it. Unlike
 * requireOrgAccess, a non-member gets 404, not 403: counselor data
 * never confirms anything about another org.
 */
export async function requireOrgHidden(
  idOrSlug: string,
  userId: string,
  opts: { write?: boolean; roles?: OrgAccess["role"][] } = {},
): Promise<OrgAccess> {
  const key = parseId(idOrSlug);
  const org = await prisma.org.findFirst({ where: { OR: [{ id: key }, { slug: key }] }, select: { id: true } });
  if (!org) throw notFound();
  return requireOrgAccessForResource(org.id, userId, opts);
}

export const isLeaderRole = (role: OrgAccess["role"]) => LEADER_ROLES.includes(role);

const SCOUT_SELECT = {
  id: true,
  orgId: true,
  email: true,
  parentIds: true,
  encFirstName: true,
  encLastName: true,
} as const;

export type ScoutRow = {
  id: string;
  orgId: string;
  email: string | null;
  parentIds: string[];
  encFirstName: Uint8Array | null;
  encLastName: Uint8Array | null;
};

/** A live youth member of `orgId` (or any org when omitted), else null. */
export async function findScout(id: string, orgId?: string): Promise<ScoutRow | null> {
  return prisma.member.findFirst({
    where: { id, isYouth: true, deletedAt: null, ...(orgId ? { orgId } : {}) },
    select: SCOUT_SELECT,
  });
}

export async function findScouts(ids: string[], orgId: string): Promise<ScoutRow[]> {
  if (!ids.length) return [];
  return prisma.member.findMany({
    where: { id: { in: ids }, orgId, isYouth: true, deletedAt: null },
    select: SCOUT_SELECT,
  });
}

/**
 * How `user` relates to `scout`: leader (by org role), the badges they
 * are assigned to counsel this scout on, and family (the scout's own
 * roster email, or a linked parent's).
 */
export async function scoutRelation(
  user: { id: string; email: string },
  role: OrgAccess["role"],
  scout: ScoutRow,
): Promise<ScoutRelation> {
  const email = user.email.toLowerCase();
  const [assignments, parentMatch] = await Promise.all([
    prisma.counselorAssignment.findMany({
      where: { orgId: scout.orgId, memberId: scout.id, counselorUserId: user.id },
      select: { badgeSlug: true },
    }),
    scout.parentIds.length
      ? prisma.member.count({
          where: {
            orgId: scout.orgId,
            id: { in: scout.parentIds },
            deletedAt: null,
            email: { equals: email, mode: "insensitive" },
          },
        })
      : Promise.resolve(0),
  ]);
  return {
    leader: isLeaderRole(role),
    badges: new Set(assignments.map((a) => a.badgeSlug)),
    family: parentMatch > 0 || (!!scout.email && scout.email.toLowerCase() === email),
  };
}

/** Per-org name decryptor. Orgs without a vault have no names to show. */
export async function orgDecryptor(orgId: string) {
  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { encryptedDek: true } });
  const dek = org?.encryptedDek ? unwrapDekWithMaster(org) : null;
  return (row: { encFirstName?: Uint8Array | null; encLastName?: Uint8Array | null; encPhone?: Uint8Array | null }) => ({
    firstName: dek ? (decryptField(row.encFirstName ?? null, dek, orgId, "member.firstName") ?? "") : "",
    lastName: dek ? (decryptField(row.encLastName ?? null, dek, orgId, "member.lastName") ?? "") : "",
    phone: dek ? decryptField(row.encPhone ?? null, dek, orgId, "member.phone") : null,
  });
}

export type Decryptor = Awaited<ReturnType<typeof orgDecryptor>>;

/** The only scout fields these routes return: id, first name, last initial. */
export function scoutView(scout: ScoutRow, decrypt: Decryptor) {
  const { firstName, lastName } = decrypt(scout);
  return { id: scout.id, firstName, lastInitial: lastInitial(lastName) };
}

export type ParentContact = { name: string; email: string | null; phone?: string };

/**
 * Linked parents of each scout, keyed by scout id. Parents with
 * neither an email nor a phone are left out (nothing to contact).
 */
export async function parentContactsFor(
  scouts: ScoutRow[],
  orgId: string,
  decrypt: Decryptor,
): Promise<Map<string, (ParentContact & { memberId: string })[]>> {
  const ids = [...new Set(scouts.flatMap((s) => s.parentIds))];
  const parents = ids.length
    ? await prisma.member.findMany({
        where: { orgId, id: { in: ids }, deletedAt: null },
        select: { id: true, email: true, encFirstName: true, encLastName: true, encPhone: true },
      })
    : [];
  const byId = new Map(
    parents.map((p) => {
      const pii = decrypt(p);
      const contact: ParentContact & { memberId: string } = {
        memberId: p.id,
        name: `${pii.firstName} ${pii.lastName}`.trim(),
        email: p.email,
      };
      if (pii.phone) contact.phone = pii.phone;
      return [p.id, contact] as const;
    }),
  );
  const out = new Map<string, (ParentContact & { memberId: string })[]>();
  for (const s of scouts) {
    out.set(
      s.id,
      s.parentIds
        .map((pid) => byId.get(pid))
        .filter((c): c is ParentContact & { memberId: string } => !!c && (!!c.email || !!c.phone)),
    );
  }
  return out;
}

export const publicContact = ({ name, email, phone }: ParentContact) =>
  phone ? { name, email, phone } : { name, email };

/**
 * Is this user a youth anywhere? Same rule as chat's classifyMember: a
 * scout role, or an email that matches a youth roster entry.
 */
export async function isYouthUser(user: { id: string; email: string }, orgId?: string): Promise<boolean> {
  const [roles, roster] = await Promise.all([
    prisma.orgMembership.count({ where: { userId: user.id, role: "scout", ...(orgId ? { orgId } : {}) } }),
    prisma.member.count({
      where: {
        isYouth: true,
        deletedAt: null,
        email: { equals: user.email, mode: "insensitive" },
        ...(orgId ? { orgId } : {}),
      },
    }),
  ]);
  return roles + roster > 0;
}
