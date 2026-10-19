// The owner console's sign-ups queue: new units and new accounts from
// the last few weeks, newest first, with what each has done since and
// where the owner is with them. That state is a SignupReview row (new,
// approved, follow_up, declined, done, plus a note and a follow-up day);
// a sign-up without one is new. Sign-ups marked "Done" before reviews
// existed are AuditLog rows (action signup.followed_up) and read as done.

import { prisma } from "@/lib/db";
import { licenseFor, type License } from "./license";
import { productsFor, type Product, UNIT_BILLING_SELECT } from "./console";

const DAY_MS = 24 * 60 * 60 * 1000;

export const SIGNUP_STATUSES = ["new", "approved", "follow_up", "declined", "done"] as const;
export type SignupStatus = (typeof SIGNUP_STATUSES)[number];

export const SIGNUP_STATUS_LABEL: Record<SignupStatus, string> = {
  new: "New",
  approved: "Approved",
  follow_up: "Follow up",
  declined: "Declined",
  done: "Done",
};

/** "todo" is new plus follow-up; the rest pick one status. */
export const SIGNUP_VIEWS = ["todo", ...SIGNUP_STATUSES, "all"] as const;
export type SignupView = (typeof SIGNUP_VIEWS)[number];

type Review = {
  status: SignupStatus;
  note: string | null;
  followUpOn: Date | null;
  reviewedAt: Date | null;
};

type Common = Review & {
  id: string;
  at: Date;
  name: string;
  products: Product[];
  /** Email confirmed (for a unit, its owner's). */
  confirmed: boolean;
  /** Suspended unit or turned-off account. */
  off: boolean;
  invitedAt: Date | null;
};

export type SignupItem =
  | (Common & {
      kind: "unit";
      slug: string;
      email: string | null;
      ownerId: string | null;
      license: License;
      paying: boolean;
      adults: number;
      scouts: number;
    })
  | (Common & {
      kind: "person";
      email: string;
      units: number;
    });

export function isSignupStatus(s: string | null | undefined): s is SignupStatus {
  return (SIGNUP_STATUSES as readonly string[]).includes(s ?? "");
}

export function isSignupView(s: string | null | undefined): s is SignupView {
  return (SIGNUP_VIEWS as readonly string[]).includes(s ?? "");
}

/** Follow-ups due by the end of today come first, then newest first. */
export function filterSignups(
  items: SignupItem[],
  { view = "todo", product = null }: { view?: SignupView; product?: Product | null },
  now: Date = new Date(),
): SignupItem[] {
  const endOfToday = new Date(now);
  endOfToday.setUTCHours(23, 59, 59, 999);
  const due = (i: SignupItem) =>
    i.status === "follow_up" && i.followUpOn !== null && i.followUpOn.getTime() <= endOfToday.getTime();
  return items
    .filter((i) =>
      view === "all" ? true : view === "todo" ? i.status === "new" || i.status === "follow_up" : i.status === view,
    )
    .filter((i) => !product || i.products.includes(product))
    .sort((a, b) => Number(due(b)) - Number(due(a)) || b.at.getTime() - a.at.getTime());
}

export async function signupQueue(
  {
    days = 30,
    view = "todo",
    product = null,
  }: { days?: number; view?: SignupView; product?: Product | null } = {},
  now: Date = new Date(),
): Promise<SignupItem[]> {
  const since = new Date(now.getTime() - days * DAY_MS);
  // A follow-up stays on the queue after the window has moved past it.
  const following = await prisma.signupReview.findMany({
    where: { status: "follow_up" },
    select: { entityType: true, entityId: true },
  });
  const followingIds = (type: string) => following.filter((f) => f.entityType === type).map((f) => f.entityId);

  const [orgs, users] = await Promise.all([
    prisma.org.findMany({
      where: { isDemo: false, OR: [{ createdAt: { gte: since } }, { id: { in: followingIds("Org") } }] },
      select: {
        ...UNIT_BILLING_SELECT,
        scoutmasterEmail: true,
        owner: { select: { id: true, email: true, emailVerified: true } },
        _count: { select: { memberships: true } },
      },
    }),
    prisma.user.findMany({
      where: { OR: [{ createdAt: { gte: since } }, { id: { in: followingIds("User") } }] },
      select: {
        id: true,
        email: true,
        displayName: true,
        emailVerified: true,
        disabledAt: true,
        createdAt: true,
        memberships: { select: { orgId: true } },
        apiTokens: { where: { revokedAt: null }, select: { name: true } },
        _count: { select: { journeyScouts: true, counselorBadges: true } },
      },
    }),
  ]);
  const ids = [...orgs.map((o) => o.id), ...users.map((u) => u.id)];
  const emails = [
    ...users.map((u) => u.email.toLowerCase()),
    ...orgs.map((o) => (o.owner?.email ?? o.scoutmasterEmail ?? "").toLowerCase()).filter(Boolean),
  ];
  const [reviews, marks, scouts, invites] = await Promise.all([
    prisma.signupReview.findMany({ where: { entityId: { in: ids } } }),
    prisma.auditLog.findMany({
      where: { action: "signup.followed_up", entityId: { in: ids } },
      select: { entityType: true, entityId: true, createdAt: true },
    }),
    prisma.member.groupBy({
      by: ["orgId"],
      where: { orgId: { in: orgs.map((o) => o.id) }, isYouth: true },
      _count: { _all: true },
    }),
    prisma.ownerInvite.findMany({
      where: { email: { in: emails, mode: "insensitive" } },
      select: { email: true, createdAt: true },
    }),
  ]);
  const reviewBy = new Map(reviews.map((r) => [`${r.entityType}:${r.entityId}`, r]));
  const markBy = new Map(marks.map((m) => [`${m.entityType}:${m.entityId}`, m.createdAt]));
  const invitedBy = new Map<string, Date>();
  for (const i of invites) {
    const key = i.email.toLowerCase();
    const prev = invitedBy.get(key);
    if (!prev || i.createdAt < prev) invitedBy.set(key, i.createdAt);
  }
  const scoutsBy = new Map(scouts.map((s) => [s.orgId, s._count._all]));
  const reviewFor = (key: string): Review => {
    const r = reviewBy.get(key);
    if (r && isSignupStatus(r.status)) {
      return { status: r.status, note: r.note, followUpOn: r.followUpOn, reviewedAt: r.updatedAt };
    }
    const marked = markBy.get(key);
    return { status: marked ? "done" : "new", note: null, followUpOn: null, reviewedAt: marked ?? null };
  };
  // Someone who signed up to start a unit shows once, as the unit.
  const unitOwners = new Set(orgs.map((o) => o.owner?.id).filter(Boolean));

  const items: SignupItem[] = [
    ...orgs.map((o) => {
      const email = o.owner?.email ?? o.scoutmasterEmail;
      const license = licenseFor(o, now);
      return {
        kind: "unit" as const,
        id: o.id,
        at: o.createdAt,
        name: o.displayName,
        slug: o.slug,
        email,
        ownerId: o.owner?.id ?? null,
        license,
        paying: Boolean(o.stripeSubscriptionId),
        products: ["compass" as const],
        confirmed: o.owner?.emailVerified ?? false,
        off: Boolean(o.suspendedAt),
        invitedAt: email ? (invitedBy.get(email.toLowerCase()) ?? null) : null,
        adults: o._count.memberships,
        scouts: scoutsBy.get(o.id) ?? 0,
        ...reviewFor(`Org:${o.id}`),
      };
    }),
    ...users
      .filter((u) => !unitOwners.has(u.id))
      .map((u) => ({
        kind: "person" as const,
        id: u.id,
        at: u.createdAt,
        name: u.displayName,
        email: u.email,
        products: productsFor({
          units: u.memberships,
          lanternScouts: u._count.journeyScouts,
          counselorBadges: u._count.counselorBadges,
          apps: u.apiTokens.map((t) => t.name),
        }),
        confirmed: u.emailVerified,
        off: Boolean(u.disabledAt),
        invitedAt: invitedBy.get(u.email.toLowerCase()) ?? null,
        units: u.memberships.length,
        ...reviewFor(`User:${u.id}`),
      })),
  ];
  return filterSignups(items, { view, product }, now);
}

export type InviteRow = {
  id: string;
  email: string;
  name: string | null;
  product: Product;
  note: string | null;
  sendCount: number;
  lastSentAt: Date;
  createdAt: Date;
  signedUpUserId: string | null;
};

/** The owner's invites, newest first, with whether each has signed up yet. */
export async function listInvites({ take = 50 }: { take?: number } = {}): Promise<InviteRow[]> {
  const invites = await prisma.ownerInvite.findMany({ orderBy: { createdAt: "desc" }, take });
  const users = await prisma.user.findMany({
    where: { email: { in: invites.map((i) => i.email), mode: "insensitive" } },
    select: { id: true, email: true },
  });
  const userBy = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
  return invites.map((i) => ({
    id: i.id,
    email: i.email,
    name: i.name,
    product: (["compass", "waypoint", "lantern"].includes(i.product) ? i.product : "compass") as Product,
    note: i.note,
    sendCount: i.sendCount,
    lastSentAt: i.lastSentAt,
    createdAt: i.createdAt,
    signedUpUserId: userBy.get(i.email.toLowerCase()) ?? null,
  }));
}

/** Sets a sign-up's status, note and follow-up day; omitted fields stay. */
export async function saveSignupReview(
  entityType: "Org" | "User",
  entityId: string,
  data: { status?: SignupStatus; note?: string | null; followUpOn?: Date | null },
  ownerId: string,
) {
  return prisma.signupReview.upsert({
    where: { entityType_entityId: { entityType, entityId } },
    create: { entityType, entityId, status: data.status ?? "new", note: data.note ?? null, followUpOn: data.followUpOn ?? null, updatedById: ownerId },
    update: { ...data, updatedById: ownerId },
  });
}
