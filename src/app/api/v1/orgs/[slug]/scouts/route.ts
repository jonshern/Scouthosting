// GET /api/v1/orgs/[id-or-slug]/scouts — the counselor's roster.
// A counselor sees only scouts assigned to them in this org; admins
// and leaders see every active youth member. Each scout is
// { id, firstName, lastInitial, assignedBadges, parentContacts } and
// nothing more: never a full last name, address, birthdate or a
// scout's own contact details. Non-members get 404.

import { prisma } from "@/lib/db";
import { json, v1Route } from "@/lib/api/v1";
import {
  findScouts,
  isLeaderRole,
  orgDecryptor,
  parentContactsFor,
  publicContact,
  requireOrgHidden,
  scoutView,
  type ScoutRow,
} from "@/lib/counselor/access";

export const runtime = "nodejs";

export const GET = v1Route<{ slug: string }>(async (_req, { user, params }) => {
  const { org, role } = await requireOrgHidden(params.slug, user.id);

  const mine = await prisma.counselorAssignment.findMany({
    where: { orgId: org.id, counselorUserId: user.id },
    select: { memberId: true, badgeSlug: true },
  });
  const badgesBy = new Map<string, string[]>();
  for (const a of mine) badgesBy.set(a.memberId, [...(badgesBy.get(a.memberId) ?? []), a.badgeSlug]);

  let scouts: ScoutRow[];
  if (isLeaderRole(role)) {
    scouts = await prisma.member.findMany({
      where: { orgId: org.id, isYouth: true, deletedAt: null, status: "active" },
      select: { id: true, orgId: true, email: true, parentIds: true, encFirstName: true, encLastName: true },
    });
  } else {
    scouts = await findScouts([...badgesBy.keys()], org.id);
  }

  const decrypt = await orgDecryptor(org.id);
  const contacts = await parentContactsFor(scouts, org.id, decrypt);
  const out = scouts.map((s) => ({
    ...scoutView(s, decrypt),
    assignedBadges: (badgesBy.get(s.id) ?? []).sort(),
    parentContacts: (contacts.get(s.id) ?? []).map(publicContact),
  }));
  out.sort((a, b) => a.firstName.localeCompare(b.firstName) || a.lastInitial.localeCompare(b.lastInitial) || a.id.localeCompare(b.id));
  return json({ scouts: out });
});
