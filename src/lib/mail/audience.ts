import { prisma } from "@/lib/db";
import { unwrapDekWithMaster } from "@/lib/encryption";
import { decryptMemberPii } from "@/lib/members/crypto";

export type AudienceKind = "everyone" | "adults" | "youth" | "leaders" | "patrol";

export type OrgAudienceSelector = {
  kind: AudienceKind;
  // for kind === "patrol"
  patrol?: string | null;
};

/** People tied to one event rather than the roster. See buildEventAudience. */
export type EventAudienceScope = "staff" | "station" | "families";
export type EventAudienceSelector = {
  kind: "event";
  eventId: string;
  scope: EventAudienceScope;
  // for scope === "station": the station's SignupSlot
  slotId?: string | null;
  // staff/station only: also reach staff who haven't answered their
  // invite yet (setup reminders). Staff who said no are never included.
  includeUnanswered?: boolean;
};

export type AudienceSelector = OrgAudienceSelector | EventAudienceSelector;

export const EVENT_SCOPE_LABELS: Record<EventAudienceScope, string> = {
  staff: "Event staff",
  station: "Station staff",
  families: "Event families",
};

export type Recipient = {
  // The roster entry behind this address, when there is one. Event
  // audiences also reach staff and guests who aren't on the roster.
  memberId: string | null;
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
  if (selector.kind === "event") return buildEventAudience(orgId, selector);
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

export function describeAudience(selector: AudienceSelector, eventTitle?: string | null): string {
  if (selector.kind === "event") {
    const base = EVENT_SCOPE_LABELS[selector.scope];
    const label = selector.includeUnanswered && selector.scope !== "families" ? `${base}, including unanswered` : base;
    return eventTitle ? `${label}: ${eventTitle}` : label;
  }
  if (selector.kind === "patrol") {
    return selector.patrol ? `Patrol: ${selector.patrol}` : "Patrol";
  }
  return AUDIENCE_LABELS[selector.kind];
}

/* ------------------------------------------------------------------ */
/* Event audiences                                                     */
/* ------------------------------------------------------------------ */

export type EventCandidate = {
  name: string;
  email: string | null | undefined;
  phone?: string | null;
  memberId?: string | null;
};

/**
 * Pure merge step for event audiences: lowercase + dedupe addresses
 * (first one wins), and drop any address in `blocked` (youth, opted
 * out, bounced). Kept separate so the rules are unit-testable.
 */
export function mergeEventRecipients(
  candidates: EventCandidate[],
  blocked: Set<string>,
): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const c of candidates) {
    const email = (c.email ?? "").trim().toLowerCase();
    if (!email || seen.has(email) || blocked.has(email)) continue;
    seen.add(email);
    out.push({ memberId: c.memberId ?? null, name: c.name || email, email, phone: c.phone ?? null });
  }
  return out;
}

/**
 * Email audience for one event:
 *
 *   staff    — EventStaff rows that said yes or maybe (plus those
 *              still invited when includeUnanswered is set)
 *   station  — the same, limited to one station (SignupSlot)
 *   families — yes/maybe RSVPs plus sign-up slot takers (public
 *              sign-ups reach the guardian who signed the scout up);
 *              when an RSVP or sign-up is a scout's own (by roster
 *              link or by email), that scout's linked parents are
 *              emailed instead
 *
 * Never a scout's address: any email on a youth roster entry, or held
 * by a user with the scout role, is dropped, as are roster addresses
 * that unsubscribed, bounced, or asked for no email.
 */
export async function buildEventAudience(
  orgId: string,
  selector: EventAudienceSelector,
): Promise<Recipient[]> {
  const event = await prisma.event.findFirst({
    where: { id: selector.eventId, orgId },
    select: { id: true },
  });
  if (!event) return [];

  const candidates: EventCandidate[] = [];
  if (selector.scope === "staff" || selector.scope === "station") {
    if (selector.scope === "station" && !selector.slotId) return [];
    const staff = await prisma.eventStaff.findMany({
      where: {
        eventId: event.id,
        orgId,
        status: { in: selector.includeUnanswered ? ["yes", "maybe", "invited"] : ["yes", "maybe"] },
        ...(selector.scope === "station" ? { slotId: selector.slotId } : {}),
      },
      orderBy: { name: "asc" },
      select: { name: true, email: true, phone: true },
    });
    candidates.push(...staff);
  } else {
    const [rsvps, assignments] = await Promise.all([
      prisma.rsvp.findMany({
        where: { eventId: event.id, orgId, response: { in: ["yes", "maybe"] } },
        orderBy: { createdAt: "asc" },
        select: {
          name: true,
          email: true,
          memberId: true,
          member: { select: { isYouth: true, parentIds: true } },
        },
      }),
      // Includes public (Waypoint) sign-ups: a row with scoutName set
      // holds a seat for a scout, but its name/email/phone are the
      // guardian's, so the guardian is who gets the email.
      prisma.slotAssignment.findMany({
        where: { orgId, slot: { eventId: event.id } },
        orderBy: { createdAt: "asc" },
        select: { name: true, email: true, phone: true },
      }),
    ]);
    const parentIds = new Set<string>();
    for (const r of rsvps) {
      if (r.member?.isYouth) {
        for (const pid of r.member.parentIds) parentIds.add(pid);
        continue;
      }
      candidates.push({ name: r.name, email: r.email, memberId: r.memberId });
    }
    candidates.push(...assignments);
    // A scout's own address is never emailed (blocked below), so copy
    // their guardians instead. The RSVP route and slot sign-ups don't
    // record which roster member they're for, so match the scout's
    // roster entry by email.
    for (const pid of await youthParentIdsByEmail(orgId, candidates.map((c) => c.email))) parentIds.add(pid);
    if (parentIds.size) candidates.push(...(await parentCandidates(orgId, [...parentIds])));
  }

  const blocked = await blockedEventEmails(
    orgId,
    candidates.map((c) => c.email),
  );
  return mergeEventRecipients(candidates, blocked);
}

/**
 * Parent roster ids for every address here that is a youth roster
 * entry in this org. That covers scout-role users too: their roster
 * entry carries the same email.
 */
async function youthParentIdsByEmail(
  orgId: string,
  emails: Array<string | null | undefined>,
): Promise<string[]> {
  const wanted = [...new Set(emails.filter((e): e is string => !!e).map((e) => e.trim().toLowerCase()))];
  if (!wanted.length) return [];
  const kids = await prisma.member.findMany({
    where: {
      orgId,
      isYouth: true,
      deletedAt: null,
      OR: wanted.map((email) => ({ email: { equals: email, mode: "insensitive" as const } })),
    },
    select: { parentIds: true },
  });
  return [...new Set(kids.flatMap((k) => k.parentIds))];
}

async function parentCandidates(orgId: string, ids: string[]): Promise<EventCandidate[]> {
  const [org, parents] = await Promise.all([
    prisma.org.findUnique({ where: { id: orgId }, select: { id: true, encryptedDek: true } }),
    prisma.member.findMany({
      where: { orgId, id: { in: ids }, isYouth: false, deletedAt: null, email: { not: null } },
      select: {
        id: true,
        email: true,
        encFirstName: true,
        encLastName: true,
        encPhone: true,
        encStreet: true,
        encCity: true,
        encState: true,
        encZip: true,
        lastNameLc1: true,
      },
    }),
  ]);
  const dek = org?.encryptedDek ? unwrapDekWithMaster(org) : null;
  return parents.map((p) => {
    const pii = dek ? decryptMemberPii(p, dek, orgId) : null;
    return {
      memberId: p.id,
      email: p.email,
      name: pii ? `${pii.firstName} ${pii.lastName}`.trim() : "",
      phone: pii?.phone ?? null,
    };
  });
}

/** Addresses an event email must skip: youth, and roster opt-outs/bounces. */
async function blockedEventEmails(
  orgId: string,
  emails: Array<string | null | undefined>,
): Promise<Set<string>> {
  const wanted = [...new Set(emails.filter((e): e is string => !!e).map((e) => e.trim().toLowerCase()))];
  if (!wanted.length) return new Set();
  const byEmail = wanted.map((email) => ({ email: { equals: email, mode: "insensitive" as const } }));
  const [members, scouts] = await Promise.all([
    prisma.member.findMany({
      where: {
        orgId,
        deletedAt: null,
        OR: byEmail,
        AND: [
          {
            OR: [
              { isYouth: true },
              { emailUnsubscribed: true },
              { bouncedAt: { not: null } },
              { commPreference: { in: ["sms", "none"] } },
            ],
          },
        ],
      },
      select: { email: true },
    }),
    prisma.orgMembership.findMany({
      where: { orgId, role: "scout", user: { OR: byEmail } },
      select: { user: { select: { email: true } } },
    }),
  ]);
  return new Set([
    ...members.map((m) => (m.email ?? "").toLowerCase()),
    ...scouts.map((s) => s.user.email.toLowerCase()),
  ]);
}
