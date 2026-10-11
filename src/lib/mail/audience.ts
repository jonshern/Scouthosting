import { prisma } from "@/lib/db";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";

export type AudienceKind = "everyone" | "adults" | "youth" | "leaders" | "patrol";

export type AudienceSelector = {
  kind: AudienceKind;
  // for kind === "patrol"
  patrol?: string | null;
};

export type Recipient = {
  memberId: string;
  name: string;
  email: string;
  phone?: string | null;
};

export const AUDIENCE_LABELS: Record<AudienceKind, string> = {
  everyone: "Everyone",
  adults: "Adults",
  youth: "Youth (parents copied)",
  leaders: "Leaders",
  patrol: "Patrol",
};

/**
 * Build the email-eligible recipient list for an audience. Filters out
 * members with no email, with `commPreference="sms"` or `"none"`, those
 * who have unsubscribed, and those with a recorded bounce/complaint.
 *
 * Matches the existing Compass `audienceFor()` semantics in lib/mail.js.
 */
export async function buildEmailAudience(
  orgId: string,
  selector: AudienceSelector
): Promise<Recipient[]> {
  const baseWhere = {
    orgId,
    deletedAt: null,
    status: "active",
    email: { not: null },
    NOT: [
      { commPreference: "sms" },
      { commPreference: "none" },
      { emailUnsubscribed: true },
      { bouncedAt: { not: null } },
    ],
  } as const;

  const where: Record<string, unknown> = { ...baseWhere };

  switch (selector.kind) {
    case "everyone":
      break;
    case "adults":
      Object.assign(where, { isYouth: false });
      break;
    case "youth":
      Object.assign(where, { isYouth: true });
      break;
    case "leaders":
      Object.assign(where, { position: { not: null } });
      break;
    case "patrol":
      if (!selector.patrol) return [];
      Object.assign(where, { patrol: selector.patrol });
      break;
  }

  const org = await prisma.org.findUnique({
    where: { id: orgId },
    select: { id: true, encryptedDek: true },
  });
  if (!org || !org.encryptedDek) return [];

  const select = {
    id: true,
    email: true,
    isYouth: true,
    parentIds: true,
    encFirstName: true,
    encLastName: true,
    encPhone: true,
    encStreet: true,
    encCity: true,
    encState: true,
    encZip: true,
    lastNameLc1: true,
  } as const;

  const members = await prisma.member.findMany({
    where: where as never,
    select,
    orderBy: [{ lastNameLc1: "asc" }, { id: "asc" }],
  });

  // Youth protection: whenever a youth member is on the list, their
  // linked parents get the same message. Parents still have to pass the
  // same deliverability/opt-out filters as everyone else.
  const parentIds = missingParentIds(members);
  const parents = parentIds.length
    ? await prisma.member.findMany({
        where: { ...baseWhere, id: { in: parentIds } } as never,
        select,
      })
    : [];

  const dek = unwrapDekWithMaster(org);
  const decrypted = [...members, ...parents].map((m) => {
    const pii = decryptMemberPii(m, dek, orgId);
    return { ...m, ...pii };
  });
  decrypted.sort((a, b) => {
    const cmp = a.lastName.localeCompare(b.lastName);
    return cmp !== 0 ? cmp : a.firstName.localeCompare(b.firstName);
  });

  return decrypted
    .filter((m): m is typeof m & { email: string } => Boolean(m.email))
    .map((m) => ({
      memberId: m.id,
      name: `${m.firstName} ${m.lastName}`.trim(),
      email: m.email,
      phone: m.phone,
    }));
}

/**
 * Parent member IDs linked to youth on the list who aren't already
 * recipients themselves.
 */
export function missingParentIds(
  members: Array<{ id: string; isYouth: boolean; parentIds: string[] }>,
): string[] {
  const onList = new Set(members.map((m) => m.id));
  const out = new Set<string>();
  for (const m of members) {
    if (!m.isYouth) continue;
    for (const pid of m.parentIds) if (!onList.has(pid)) out.add(pid);
  }
  return [...out];
}

export function describeAudience(selector: AudienceSelector): string {
  if (selector.kind === "patrol") {
    return selector.patrol ? `Patrol: ${selector.patrol}` : "Patrol";
  }
  return AUDIENCE_LABELS[selector.kind];
}
