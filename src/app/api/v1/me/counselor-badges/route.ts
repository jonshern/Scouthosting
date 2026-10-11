// GET /api/v1/me/counselor-badges — badge slugs the signed-in adult
// counsels. PUT with { badges: string[] } replaces the list.
//
// The list belongs to the user, not to an org: counselors register
// with the council and serve every unit. Units decide which scouts a
// counselor works with through counselor assignments.

import { prisma } from "@/lib/db";
import { forbidden, json, readJson, v1Route } from "@/lib/api/v1";
import { isYouthUser } from "@/lib/counselor/access";
import { CounselorBadgesBody } from "@/lib/counselor/ids";

export const runtime = "nodejs";

async function list(userId: string) {
  const rows = await prisma.counselorBadge.findMany({
    where: { userId },
    select: { badgeSlug: true },
    orderBy: { badgeSlug: "asc" },
  });
  return rows.map((r) => r.badgeSlug);
}

export const GET = v1Route(async (_req, { user }) => {
  return json({ badges: await list(user.id) });
});

export const PUT = v1Route(async (req, { user }) => {
  // Counselors are adults: a user who is a scout anywhere can't list badges.
  if (await isYouthUser(user)) throw forbidden("youth");
  const { badges } = await readJson(req, CounselorBadgesBody);
  await prisma.$transaction([
    prisma.counselorBadge.deleteMany({ where: { userId: user.id, badgeSlug: { notIn: badges } } }),
    prisma.counselorBadge.createMany({
      data: badges.map((badgeSlug) => ({ userId: user.id, badgeSlug })),
      skipDuplicates: true,
    }),
  ]);
  return json({ badges: await list(user.id) });
});
