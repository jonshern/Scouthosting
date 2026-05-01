// Position-based delegation.
//
// `OrgMembership.role` is the coarse grant — "leader" or "admin" — that
// gates the admin app at all. This module adds the *finer* scope: a
// "leader" who is the Treasurer can reach treasurer surfaces; a Den
// Leader can broadcast to their den; a Senior Patrol Leader can post to
// the patrol channel without needing the Scoutmaster's password.
//
// The mapping is intentionally generous on overlapping responsibilities:
// a Committee Chair counts as both committee-chair and unit-admin so a
// chair page doesn't need to special-case them.
//
// Inputs: a position string (free-form — comes from Member.position) and
// the unit type (Pack / Troop / GirlScoutTroop / …). Output: a Set of
// scope strings. Empty set = no extra delegation beyond their base
// OrgMembership role.

/**
 * Stable scope vocabulary. Add to it sparingly — every scope that ships
 * is a real authorisation surface.
 */
export const SCOPES = Object.freeze({
  UNIT_LEADER: "unit-leader",         // Scoutmaster / Cubmaster / Skipper / Crew Advisor / Post Advisor / Troop Leader
  ASSISTANT_LEADER: "assistant",      // ASM / Asst Cubmaster / Mate / Associate Advisor / Co-Leader
  COMMITTEE_CHAIR: "committee-chair", // Committee Chair (or Service Unit Manager for GS)
  COMMITTEE: "committee",             // Committee Member, Treasurer, Secretary, etc.
  TREASURER: "treasurer",             // Treasurer (or Cookie Manager for GS)
  SECRETARY: "secretary",             // Secretary
  ADVANCEMENT: "advancement",         // Advancement / OA / training-tracking adult
  YOUTH_LEADER: "youth-leader",       // SPL / ASPL / Crew President / Boatswain — youth running the youth program
  PATROL_LEADER: "patrol-leader",     // Patrol Leader / Den Chief / Den Leader (the section head)
  COR: "chartered-org-rep",           // Chartered Organization Representative
});

// Position → scopes mapping. Lookup is case-insensitive on a normalised
// (whitespace-collapsed) key so "  Scoutmaster " matches "Scoutmaster".
//
// A position can grant multiple scopes — e.g. Committee Chair grants
// both COMMITTEE_CHAIR and COMMITTEE — so any check that asks "is this
// person on the committee?" gets a yes for the chair too.
const POSITION_SCOPES = {
  // Cub Scouts — Pack
  "cubmaster": [SCOPES.UNIT_LEADER],
  "assistant cubmaster": [SCOPES.ASSISTANT_LEADER],
  "den leader": [SCOPES.PATROL_LEADER],
  "assistant den leader": [SCOPES.PATROL_LEADER],
  "pack trainer": [SCOPES.ADVANCEMENT],

  // Scouts BSA — Troop
  "scoutmaster": [SCOPES.UNIT_LEADER],
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
  "skipper": [SCOPES.UNIT_LEADER],
  "mate": [SCOPES.ASSISTANT_LEADER],
  "boatswain": [SCOPES.YOUTH_LEADER],
  "boatswain's mate": [SCOPES.YOUTH_LEADER],
  "yeoman": [SCOPES.SECRETARY],
  "purser": [SCOPES.TREASURER],
  "storekeeper": [SCOPES.COMMITTEE],

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
  "volunteer": [], // generic GS volunteer — no extra scope, just a record

  // Cross-program common positions
  "committee chair": [SCOPES.COMMITTEE_CHAIR, SCOPES.COMMITTEE],
  "committee member": [SCOPES.COMMITTEE],
  "treasurer": [SCOPES.TREASURER, SCOPES.COMMITTEE],
  "secretary": [SCOPES.SECRETARY, SCOPES.COMMITTEE],
  "chartered organization representative": [SCOPES.COR],
  "quartermaster": [SCOPES.COMMITTEE],
  "scribe": [SCOPES.SECRETARY],
  "historian": [],
  "librarian": [],
  "bugler": [],
  "chaplain aide": [],
};

function normalisePosition(pos) {
  if (!pos) return "";
  return String(pos).trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Return the Set of scopes a position grants. Free-form / unknown
 * positions return an empty Set — they don't get implicit privilege,
 * but the user can still hold an OrgMembership role.
 */
export function scopesForPosition(position) {
  const key = normalisePosition(position);
  if (!key) return new Set();
  const scopes = POSITION_SCOPES[key];
  return new Set(scopes || []);
}

/**
 * Test helper: does this position grant a specific scope?
 */
export function positionHasScope(position, scope) {
  return scopesForPosition(position).has(scope);
}

/**
 * Aggregate scopes across multiple positions a member might hold —
 * volunteers commonly wear two hats (Committee Chair + Treasurer).
 */
export function scopesForPositions(positions) {
  const out = new Set();
  for (const p of positions || []) {
    for (const s of scopesForPosition(p)) out.add(s);
  }
  return out;
}

// Scopes a coarse "leader" OrgMembership role doesn't cover by itself —
// these gates require the matching position (Treasurer, Secretary, an
// advancement-tracking title) before letting a non-admin leader through.
const NARROW_SCOPES = new Set([
  SCOPES.TREASURER,
  SCOPES.SECRETARY,
  SCOPES.ADVANCEMENT,
]);

/**
 * Express middleware factory. Allows the request through if the user is
 * an org admin (always passes), holds a Member position granting one of
 * the required scopes, or is a coarse leader and the gate isn't narrow.
 *
 * Lazily loads `req.member` (by email match against the org's Member
 * directory) only when needed — admin pages that don't gate on scope
 * never pay for the lookup. Expects `prisma` to be passed in so this
 * module stays free of server-side imports.
 */
export function requireScope(prisma, ...wanted) {
  const wantSet = new Set(wanted);
  const allNarrow = [...wantSet].every((s) => NARROW_SCOPES.has(s));
  return async function scopeGate(req, res, next) {
    if (req.role === "admin") return next();
    if (req.role === "leader" && !allNarrow) return next();
    if (!req.member && req.user?.email && req.org?.id) {
      req.member = await prisma.member.findFirst({
        where: { orgId: req.org.id, email: req.user.email.toLowerCase() },
        select: { id: true, position: true, isYouth: true, patrol: true },
      });
    }
    const granted = scopesForPosition(req.member?.position);
    for (const w of wantSet) {
      if (granted.has(w)) return next();
    }
    return res.status(403).type("text/plain").send(
      `This page requires the ${[...wantSet].join(" or ")} role. ` +
        `Ask your Scoutmaster or Committee Chair to set your position in the directory.`,
    );
  };
}
