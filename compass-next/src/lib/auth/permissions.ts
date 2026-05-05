// Position-based delegation.
//
// `OrgMembership.role` is the coarse grant — "leader" / "admin" — that
// gates the admin app at all. This module adds the *finer* scope: a
// "leader" who is the Treasurer can reach treasurer surfaces; a Den
// Leader can broadcast to their den; etc.
//
// Inputs: a position string (free-form — comes from Member.position)
// and the unit type (Pack / Troop / GirlScoutTroop / …). Output: a
// Set of scope strings. Empty set = no extra delegation beyond the
// base OrgMembership role.

export const SCOPES = {
  UNIT_LEADER: "unit-leader",
  ASSISTANT_LEADER: "assistant",
  COMMITTEE_CHAIR: "committee-chair",
  COMMITTEE: "committee",
  TREASURER: "treasurer",
  SECRETARY: "secretary",
  ADVANCEMENT: "advancement",
  YOUTH_LEADER: "youth-leader",
  PATROL_LEADER: "patrol-leader",
  COR: "chartered-org-rep",
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

const POSITION_SCOPES: Record<string, Scope[]> = {
  // Cub Scouts — Pack
  cubmaster: [SCOPES.UNIT_LEADER],
  "assistant cubmaster": [SCOPES.ASSISTANT_LEADER],
  "den leader": [SCOPES.PATROL_LEADER],
  "assistant den leader": [SCOPES.PATROL_LEADER],
  "pack trainer": [SCOPES.ADVANCEMENT],

  // Scouts BSA — Troop
  scoutmaster: [SCOPES.UNIT_LEADER],
  "assistant scoutmaster": [SCOPES.ASSISTANT_LEADER],
  "junior assistant scoutmaster": [SCOPES.YOUTH_LEADER],
  "senior patrol leader": [SCOPES.YOUTH_LEADER],
  "assistant senior patrol leader": [SCOPES.YOUTH_LEADER],
  "patrol leader": [SCOPES.PATROL_LEADER],
  "assistant patrol leader": [SCOPES.PATROL_LEADER],
  "troop guide": [SCOPES.PATROL_LEADER],
  "den chief": [SCOPES.PATROL_LEADER],
  "advancement coordinator": [SCOPES.ADVANCEMENT],
  "outdoor coordinator": [SCOPES.ADVANCEMENT],
  "order of the arrow representative": [SCOPES.ADVANCEMENT],

  // Venturing — Crew
  "crew advisor": [SCOPES.UNIT_LEADER],
  "associate advisor": [SCOPES.ASSISTANT_LEADER],
  "crew president": [SCOPES.YOUTH_LEADER],
  "vice president of administration": [SCOPES.YOUTH_LEADER],
  "vice president of program": [SCOPES.YOUTH_LEADER],

  // Sea Scouts — Ship
  skipper: [SCOPES.UNIT_LEADER],
  mate: [SCOPES.ASSISTANT_LEADER],
  boatswain: [SCOPES.YOUTH_LEADER],
  "boatswain's mate": [SCOPES.YOUTH_LEADER],
  yeoman: [SCOPES.SECRETARY],
  purser: [SCOPES.TREASURER],
  storekeeper: [SCOPES.COMMITTEE],

  // Exploring — Post
  "post advisor": [SCOPES.UNIT_LEADER],
  "post president": [SCOPES.YOUTH_LEADER],
  "vice president": [SCOPES.YOUTH_LEADER],

  // Girl Scouts — Troop
  "troop leader": [SCOPES.UNIT_LEADER],
  "co-leader": [SCOPES.ASSISTANT_LEADER],
  "troop treasurer": [SCOPES.TREASURER],
  "cookie manager": [SCOPES.TREASURER],
  "fall product manager": [SCOPES.TREASURER],
  "service unit manager": [SCOPES.COMMITTEE_CHAIR],
  "service unit treasurer": [SCOPES.TREASURER],
  "troop president": [SCOPES.YOUTH_LEADER],
  volunteer: [],

  // Cross-program common positions
  "committee chair": [SCOPES.COMMITTEE_CHAIR, SCOPES.COMMITTEE],
  "committee member": [SCOPES.COMMITTEE],
  treasurer: [SCOPES.TREASURER, SCOPES.COMMITTEE],
  secretary: [SCOPES.SECRETARY, SCOPES.COMMITTEE],
  "chartered organization representative": [SCOPES.COR],
  quartermaster: [SCOPES.COMMITTEE],
  scribe: [SCOPES.SECRETARY],
  historian: [],
  librarian: [],
  bugler: [],
  "chaplain aide": [],
};

function normalisePosition(pos: string | null | undefined): string {
  if (!pos) return "";
  return String(pos).trim().replace(/\s+/g, " ").toLowerCase();
}

export function scopesForPosition(position: string | null | undefined): Set<Scope> {
  const key = normalisePosition(position);
  if (!key) return new Set();
  const scopes = POSITION_SCOPES[key];
  return new Set(scopes || []);
}

export function positionHasScope(position: string | null | undefined, scope: Scope): boolean {
  return scopesForPosition(position).has(scope);
}

export function scopesForPositions(positions: ReadonlyArray<string | null | undefined>): Set<Scope> {
  const out = new Set<Scope>();
  for (const p of positions ?? []) {
    for (const s of scopesForPosition(p)) out.add(s);
  }
  return out;
}

// Scopes a coarse "leader" OrgMembership role doesn't cover by itself —
// require the matching position before letting a non-admin leader
// through.
const NARROW_SCOPES: ReadonlySet<Scope> = new Set([
  SCOPES.TREASURER,
  SCOPES.SECRETARY,
  SCOPES.ADVANCEMENT,
]);

export type ActorRole = "admin" | "leader" | "parent" | "scout" | string | null | undefined;

/**
 * Check whether an actor is allowed access given a set of required
 * scopes. Replaces the Express `requireScope` middleware: callers
 * compute the inputs (actor's role, the matching member's position)
 * and this returns ok/forbidden.
 *
 * Rules (in order):
 *   - admin role → always ok
 *   - leader role + at least one wanted scope is NOT narrow → ok
 *   - any wanted scope is granted by the actor's Member.position → ok
 *   - otherwise forbidden
 */
export function checkScope(
  actor: { role: ActorRole; position?: string | null | undefined },
  ...wanted: Scope[]
): { ok: true } | { ok: false; reason: string; required: Scope[] } {
  const wantSet = new Set<Scope>(wanted);
  if (wantSet.size === 0) return { ok: true };
  if (actor.role === "admin") return { ok: true };
  const allNarrow = [...wantSet].every((s) => NARROW_SCOPES.has(s));
  if (actor.role === "leader" && !allNarrow) return { ok: true };
  const granted = scopesForPosition(actor.position);
  for (const w of wantSet) {
    if (granted.has(w)) return { ok: true };
  }
  return {
    ok: false,
    reason: `requires ${[...wantSet].join(" or ")} scope`,
    required: [...wantSet],
  };
}
