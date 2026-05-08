// Emergency contact list for an event.
//
// For each "yes" RSVP that's linked to a roster Member, gather the
// parent/guardian Members (via Member.parentIds) plus the attendee's
// own phone. Returns plaintext rows (PII decrypted with the org's DEK)
// for rendering in the leader's pocket-list view or CSV export.
//
// Adults RSVPing without parents simply have no guardians listed;
// their own phone/email is still surfaced as the contact line.
//
// Caller MUST be a leader (page-level guard); this helper does no
// authorization itself.

import type { Org, Member } from "@prisma/client";
import { prisma } from "@/lib/db";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";

export type EmergencyContact = {
  // The attendee.
  memberId: string;
  scoutFirstName: string;
  scoutLastName: string;
  isYouth: boolean;
  patrol: string | null;
  scoutPhone: string | null;
  scoutEmail: string | null;
  notes: string | null;
  // Resolved parents/guardians, decrypted.
  guardians: {
    memberId: string;
    name: string;
    phone: string | null;
    email: string | null;
  }[];
};

export async function emergencyContactsForEvent(
  org: Pick<Org, "id" | "encryptedDek">,
  eventId: string,
): Promise<EmergencyContact[]> {
  if (!org.encryptedDek) return [];

  // Yes-RSVPs with a linked roster Member.
  const rsvps = await prisma.rsvp.findMany({
    where: { orgId: org.id, eventId, response: "yes", memberId: { not: null } },
    include: { member: true },
    orderBy: { createdAt: "asc" },
  });

  // Collect every parentId we'll need to load in one round-trip.
  const parentIds = new Set<string>();
  for (const r of rsvps) {
    if (!r.member) continue;
    for (const pid of r.member.parentIds) parentIds.add(pid);
  }

  const parents = parentIds.size
    ? await prisma.member.findMany({
        where: { orgId: org.id, id: { in: [...parentIds] } },
      })
    : [];
  const parentById = new Map<string, Member>(parents.map((p) => [p.id, p]));

  const dek = unwrapDekWithMaster(org);

  const rows: EmergencyContact[] = [];
  for (const r of rsvps) {
    if (!r.member) continue;
    const m = r.member;
    const pii = decryptMemberPii(m, dek, org.id);
    const guardians = m.parentIds.flatMap((pid) => {
      const p = parentById.get(pid);
      if (!p) return [];
      const ppii = decryptMemberPii(p, dek, org.id);
      return [
        {
          memberId: p.id,
          name: `${ppii.firstName} ${ppii.lastName}`.trim(),
          phone: ppii.phone,
          email: p.email,
        },
      ];
    });
    rows.push({
      memberId: m.id,
      scoutFirstName: pii.firstName,
      scoutLastName: pii.lastName,
      isYouth: m.isYouth,
      patrol: m.patrol,
      scoutPhone: pii.phone,
      scoutEmail: m.email,
      notes: m.notes,
      guardians,
    });
  }

  // Stable sort: youth first by lastName, then adults.
  rows.sort((a, b) => {
    if (a.isYouth !== b.isYouth) return a.isYouth ? -1 : 1;
    const c = a.scoutLastName.localeCompare(b.scoutLastName);
    return c !== 0 ? c : a.scoutFirstName.localeCompare(b.scoutFirstName);
  });

  return rows;
}
