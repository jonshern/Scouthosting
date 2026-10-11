// Counselor meetings.
//
// GET  /api/v1/counselor/meetings?from=&to=&org= — the caller's
//      meetings (as counselor), in orgs they still belong to.
// POST /api/v1/counselor/meetings — { org, badgeSlug, scoutIds[],
//      startsAt, endsAt?, place, notes?, notifyAdultUserIds? }.
//
// Youth protection: every meeting stores who gets notified about it:
// each scout's linked parents (always, automatically) plus any other
// adult org members named in notifyAdultUserIds. A meeting with nobody
// to notify (no parent contact and no other adult) is refused with
// no_adult_notified. Compass doesn't send meeting notifications yet;
// a sender must use this stored list so parents are always copied,
// and must never email a scout directly.
//
// Only an admin/leader of the org, or a counselor assigned to every
// listed scout for this badge, may create a meeting.

import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  ApiError,
  IsoDate,
  badRequest,
  json,
  notFound,
  readJson,
  readQuery,
  v1Route,
} from "@/lib/api/v1";
import {
  findScouts,
  isLeaderRole,
  isYouthUser,
  orgDecryptor,
  parentContactsFor,
  publicContact,
  requireOrgHidden,
  scoutView,
} from "@/lib/counselor/access";
import { MeetingBody } from "@/lib/counselor/ids";

export const runtime = "nodejs";

const Query = z.object({
  from: IsoDate.optional(),
  to: IsoDate.optional(),
  org: z.string().max(64).optional(),
});

const MEETING_INCLUDE = {
  org: { select: { slug: true } },
  scouts: { select: { memberId: true } },
  notify: true,
} as const;

type NotifyView =
  | { kind: "parent"; scoutId: string | null; name: string; email: string | null; phone?: string }
  | { kind: "adult"; userId: string; name: string; email: string };

type MeetingRow = Awaited<ReturnType<typeof loadMeetings>>[number];

function loadMeetings(where: object) {
  return prisma.counselorMeeting.findMany({
    where,
    include: MEETING_INCLUDE,
    orderBy: { startsAt: "asc" },
    take: 200,
  });
}

/** Meeting views for one org's meetings (one DEK unwrap). */
async function viewsForOrg(orgId: string, meetings: MeetingRow[]) {
  const decrypt = await orgDecryptor(orgId);
  const scoutIds = [...new Set(meetings.flatMap((m) => m.scouts.map((s) => s.memberId)))];
  const scouts = await prisma.member.findMany({
    where: { orgId, id: { in: scoutIds } },
    select: { id: true, orgId: true, email: true, parentIds: true, encFirstName: true, encLastName: true },
  });
  const scoutById = new Map(scouts.map((s) => [s.id, s]));

  const parentIds = [...new Set(meetings.flatMap((m) => m.notify.map((n) => n.memberId).filter((x): x is string => !!x)))];
  const parents = parentIds.length
    ? await prisma.member.findMany({
        where: { orgId, id: { in: parentIds }, deletedAt: null },
        select: { id: true, email: true, encFirstName: true, encLastName: true, encPhone: true },
      })
    : [];
  const parentById = new Map(parents.map((p) => [p.id, p]));

  const userIds = [...new Set(meetings.flatMap((m) => m.notify.map((n) => n.userId).filter((x): x is string => !!x)))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true, email: true } })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  return meetings.map((m) => ({
    id: m.id,
    orgSlug: m.org.slug,
    badgeSlug: m.badgeSlug,
    startsAt: m.startsAt,
    endsAt: m.endsAt,
    place: m.place,
    notes: m.notes,
    scouts: m.scouts
      .map((s) => scoutById.get(s.memberId))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => scoutView(s, decrypt)),
    notify: m.notify.flatMap((n): NotifyView[] => {
      if (n.kind === "parent" && n.memberId) {
        const p = parentById.get(n.memberId);
        if (!p) return [];
        const pii = decrypt(p);
        return [
          {
            kind: "parent" as const,
            scoutId: n.forMemberId,
            ...publicContact({ name: `${pii.firstName} ${pii.lastName}`.trim(), email: p.email, phone: pii.phone ?? undefined }),
          },
        ];
      }
      if (n.kind === "adult" && n.userId) {
        const u = userById.get(n.userId);
        return u ? [{ kind: "adult" as const, userId: u.id, name: u.displayName, email: u.email }] : [];
      }
      return [];
    }),
    createdAt: m.createdAt,
  }));
}

export const GET = v1Route(async (req, { user }) => {
  const q = readQuery(req, Query);
  if (q.from && q.to && q.from > q.to) throw badRequest("invalid_range");
  const memberships = await prisma.orgMembership.findMany({
    where: { userId: user.id },
    select: { orgId: true, org: { select: { slug: true } } },
  });
  let orgIds = memberships.map((m) => m.orgId);
  if (q.org) orgIds = memberships.filter((m) => m.orgId === q.org || m.org.slug === q.org).map((m) => m.orgId);

  const meetings = await loadMeetings({
    counselorUserId: user.id,
    orgId: { in: orgIds },
    ...(q.from || q.to ? { startsAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
  });
  const byOrg = new Map<string, MeetingRow[]>();
  for (const m of meetings) byOrg.set(m.orgId, [...(byOrg.get(m.orgId) ?? []), m]);
  const views = (await Promise.all([...byOrg].map(([orgId, ms]) => viewsForOrg(orgId, ms)))).flat();
  views.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return json({ meetings: views });
});

export const POST = v1Route(async (req, { user }) => {
  const input = await readJson(req, MeetingBody);
  const { org, role } = await requireOrgHidden(input.org, user.id, { write: true });

  const scouts = await findScouts(input.scoutIds, org.id);
  if (scouts.length !== input.scoutIds.length) throw notFound("scout_not_found");

  if (!isLeaderRole(role)) {
    const assigned = await prisma.counselorAssignment.findMany({
      where: { orgId: org.id, counselorUserId: user.id, badgeSlug: input.badgeSlug, memberId: { in: input.scoutIds } },
      select: { memberId: true },
    });
    const ok = new Set(assigned.map((a) => a.memberId));
    const missing = input.scoutIds.find((id) => !ok.has(id));
    if (missing) throw new ApiError(403, "forbidden", { reason: "not_assigned", scoutId: missing });
  }

  // Other adults to notify: adult members of this org, not the caller.
  const adults = input.notifyAdultUserIds.length
    ? await prisma.orgMembership.findMany({
        where: { orgId: org.id, userId: { in: input.notifyAdultUserIds }, role: { not: "scout" } },
        select: { user: { select: { id: true, email: true } } },
      })
    : [];
  for (const id of input.notifyAdultUserIds) {
    const a = adults.find((x) => x.user.id === id);
    if (!a || id === user.id || (await isYouthUser(a.user, org.id))) {
      throw badRequest("invalid_notify_adult", { userId: id });
    }
  }

  const decrypt = await orgDecryptor(org.id);
  const contacts = await parentContactsFor(scouts, org.id, decrypt);
  const parentRows = scouts.flatMap((s) =>
    (contacts.get(s.id) ?? []).map((c) => ({ kind: "parent", memberId: c.memberId, forMemberId: s.id })),
  );
  if (parentRows.length + adults.length === 0) throw badRequest("no_adult_notified");

  const meeting = await prisma.counselorMeeting.create({
    data: {
      orgId: org.id,
      counselorUserId: user.id,
      badgeSlug: input.badgeSlug,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      place: input.place,
      notes: input.notes || null,
      scouts: { create: scouts.map((s) => ({ memberId: s.id })) },
      notify: {
        create: [
          ...parentRows,
          ...input.notifyAdultUserIds.map((userId) => ({ kind: "adult", userId })),
        ],
      },
    },
    include: MEETING_INCLUDE,
  });
  const [view] = await viewsForOrg(org.id, [meeting]);
  return json({ meeting: view }, { status: 201 });
});
