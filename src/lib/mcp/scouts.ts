// Which scouts the signed-in adult may ask Claude about, and finding
// one by name ("Emmett").
//
// Two kinds, merged into one list:
//
// Troop scouts: the rule GET /api/v1/scouts/:id/progress applies
// (lib/counselor/access.ts#scoutRelation), narrowed for the connector:
//   - family: a youth Member whose parentIds include the adult's own
//     roster entry (matched by confirmed email) in that org
//   - leader: every youth Member of an org where the adult is a leader
//     or admin
// and in both cases the adult must hold an OrgMembership in the scout's
// org. Counselor-only access (one badge for one scout) is not offered.
//
// Lantern scouts: the JourneyScouts this adult added in Lantern
// (lib/journey/store.ts), owner only. When one is linked to a troop
// scout this adult may see as family, the two are one scout here.
//
// A youth account gets nothing. Troop names go out as first name and
// last initial only.

import { prisma } from "@/lib/db";
import { LEADER_ROLES } from "@/lib/api/v1";
import { isYouthUser, orgDecryptor } from "@/lib/counselor/access";
import { lastInitial } from "@/lib/counselor/ids";
import { decryptScoutName } from "@/lib/journey/crypto";

export type McpUser = { id: string; email: string; displayName: string };

export type AccessibleScout = {
  /** The troop Member id, or the Lantern JourneyScout id for a Lantern-only scout. */
  id: string;
  /** Troop roster entry, when the scout is in a unit on Compass. */
  memberId: string | null;
  /** The adult's Lantern record for this scout, if any. */
  journeyId: string | null;
  orgId: string | null;
  orgSlug: string | null;
  /** The unit's name, or "Lantern" for a scout followed only in Lantern. */
  orgName: string;
  firstName: string;
  lastInitial: string;
  /** "Emmett S." */
  label: string;
  patrol: string | null;
  relation: "family" | "leader";
  /** The adult's role in the scout's org (null for Lantern-only). */
  role: "scout" | "parent" | "leader" | "admin" | null;
};

export class ScoutLookupError extends Error {
  constructor(
    message: string,
    readonly choices: AccessibleScout[] = [],
  ) {
    super(message);
    this.name = "ScoutLookupError";
  }
}

export async function accessibleScouts(user: McpUser): Promise<AccessibleScout[]> {
  if (await isYouthUser(user)) return [];
  const [troop, lantern] = await Promise.all([troopScouts(user), prisma.journeyScout.findMany({
    where: { ownerUserId: user.id },
    select: { id: true, ownerUserId: true, encName: true, memberId: true },
    orderBy: { createdAt: "asc" },
  })]);

  const out = [...troop];
  for (const j of lantern) {
    const linked = j.memberId ? out.find((t) => t.memberId === j.memberId && t.relation === "family" && !t.journeyId) : undefined;
    if (linked) {
      linked.journeyId = j.id;
      continue;
    }
    const name = decryptScoutName(j.ownerUserId, j.encName) || "Scout";
    out.push({
      id: j.id,
      memberId: null,
      journeyId: j.id,
      orgId: null,
      orgSlug: null,
      orgName: "Lantern",
      firstName: name.split(/\s+/)[0] ?? name,
      lastInitial: "",
      label: name,
      patrol: null,
      relation: "family",
      role: null,
    });
  }
  out.sort((a, b) => (a.relation === b.relation ? a.label.localeCompare(b.label) : a.relation === "family" ? -1 : 1));
  return out;
}

async function troopScouts(user: McpUser): Promise<AccessibleScout[]> {
  const memberships = await prisma.orgMembership.findMany({
    where: { userId: user.id },
    select: { orgId: true, role: true, org: { select: { id: true, slug: true, displayName: true } } },
  });
  if (!memberships.length) return [];
  const orgIds = memberships.map((m) => m.orgId);
  const roleByOrg = new Map(memberships.map((m) => [m.orgId, m.role]));
  const orgById = new Map(memberships.map((m) => [m.orgId, m.org]));
  const leaderOrgs = memberships.filter((m) => LEADER_ROLES.includes(m.role)).map((m) => m.orgId);

  // Family needs a confirmed email, as Lantern's troopScoutsFor does, so
  // nobody gets another family's scout by signing up with their address.
  const verified = !!(await prisma.user.findUnique({ where: { id: user.id }, select: { emailVerified: true } }))?.emailVerified;
  const myRosterRows = verified
    ? await prisma.member.findMany({
        where: { orgId: { in: orgIds }, deletedAt: null, email: { equals: user.email, mode: "insensitive" } },
        select: { id: true, orgId: true },
      })
    : [];
  const myRosterIds = myRosterRows.map((r) => r.id);

  const youth = await prisma.member.findMany({
    where: {
      isYouth: true,
      deletedAt: null,
      OR: [
        ...(myRosterIds.length ? [{ orgId: { in: orgIds }, parentIds: { hasSome: myRosterIds } }] : []),
        ...(leaderOrgs.length ? [{ orgId: { in: leaderOrgs } }] : []),
      ],
    },
    select: { id: true, orgId: true, parentIds: true, patrol: true, encFirstName: true, encLastName: true },
  });
  if (!youth.length) return [];

  const myIdsByOrg = new Map<string, Set<string>>();
  for (const r of myRosterRows) myIdsByOrg.set(r.orgId, (myIdsByOrg.get(r.orgId) ?? new Set()).add(r.id));

  const decryptors = new Map<string, Awaited<ReturnType<typeof orgDecryptor>>>();
  const out: AccessibleScout[] = [];
  for (const y of youth) {
    const role = roleByOrg.get(y.orgId);
    const org = orgById.get(y.orgId);
    if (!role || !org) continue;
    const mine = myIdsByOrg.get(y.orgId);
    const family = !!mine && y.parentIds.some((p) => mine.has(p));
    const leader = LEADER_ROLES.includes(role);
    if (!family && !leader) continue;

    let decrypt = decryptors.get(y.orgId);
    if (!decrypt) {
      decrypt = await orgDecryptor(y.orgId);
      decryptors.set(y.orgId, decrypt);
    }
    const { firstName, lastName } = decrypt(y);
    const initial = lastInitial(lastName);
    out.push({
      id: y.id,
      memberId: y.id,
      journeyId: null,
      orgId: y.orgId,
      orgSlug: org.slug,
      orgName: org.displayName,
      firstName: firstName || "Scout",
      lastInitial: initial,
      label: `${firstName || "Scout"}${initial ? ` ${initial}.` : ""}`,
      patrol: y.patrol,
      relation: family ? "family" : "leader",
      role,
    });
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/**
 * Pick one scout from `scouts` by id or name. With no name, the only
 * family scout (or the only scout at all) is the answer. Family matches
 * win over unit matches, so a leader asking about their own child gets
 * their child even if another scout in the troop shares the name.
 */
export function pickScout(scouts: AccessibleScout[], query: string | null | undefined): AccessibleScout {
  if (!scouts.length) {
    throw new ScoutLookupError(
      "No scouts are linked to this Compass account. A unit leader links a scout to a parent on the roster (the parent's email must match this account).",
    );
  }
  const q = norm(query ?? "");
  if (!q) {
    const family = scouts.filter((s) => s.relation === "family");
    if (family.length === 1) return family[0];
    if (!family.length && scouts.length === 1) return scouts[0];
    throw new ScoutLookupError("Which scout? Pass a name.", family.length ? family : scouts);
  }
  const byId = scouts.find((s) => s.id === query || s.memberId === query || s.journeyId === query);
  if (byId) return byId;

  const matches = scouts.filter((s) => {
    const first = norm(s.firstName);
    const full = norm(`${s.firstName} ${s.lastInitial}`);
    const label = norm(s.label);
    return (
      first === q ||
      full === q ||
      label === q ||
      full.startsWith(q) ||
      (!!s.lastInitial && q.startsWith(`${first} `) && q.split(" ")[1]?.[0] === s.lastInitial.toLowerCase())
    );
  });
  const pool = matches.some((s) => s.relation === "family") ? matches.filter((s) => s.relation === "family") : matches;
  if (pool.length === 1) return pool[0];
  if (pool.length > 1) throw new ScoutLookupError(`More than one scout matches "${query}".`, pool);
  throw new ScoutLookupError(`No scout named "${query}" is linked to this account.`, scouts.filter((s) => s.relation === "family"));
}
