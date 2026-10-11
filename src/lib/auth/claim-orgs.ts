// A unit's founding leader is recorded as Org.scoutmasterEmail at
// provisioning. Whoever proves they own that address becomes the unit's
// admin (and owner, if it has none yet).
//
// Only ever call this with an email the user has proven: a Google/Apple
// sign-in with a verified email, or a completed email-verification link.
// Granting it on an unverified password sign-up would let anyone claim a
// unit by typing the scoutmaster's address.

import { prisma } from "@/lib/db";

export async function claimOrgsForVerifiedEmail(userId: string, email: string): Promise<number> {
  const orgs = await prisma.org.findMany({
    where: { scoutmasterEmail: email.toLowerCase() },
    select: { id: true },
  });
  if (orgs.length === 0) return 0;
  await prisma.orgMembership.createMany({
    data: orgs.map((o) => ({ userId, orgId: o.id, role: "admin" })),
    skipDuplicates: true,
  });
  await prisma.org.updateMany({
    where: { id: { in: orgs.map((o) => o.id) }, ownerId: null },
    data: { ownerId: userId },
  });
  return orgs.length;
}
