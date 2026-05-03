// Unit-type-aware roles + subgroup vocabulary.
//
// Different programs use different language for the same idea:
//   - Cub Scout Pack → "Cubmaster"/"Den Leader"; youth in rank-named dens
//   - Scouts BSA Troop → "Scoutmaster"/"ASM"; youth in free-form patrols
//   - Venturing Crew / Sea Scout Ship / Exploring Post → "Advisor"/
//     "Skipper"; subgroups don't subdivide as crisply
//   - Girl Scout Troop → "Troop Leader"/"Co-Leader"; youth in age-graded
//     levels (Daisy through Ambassador)
//
// Single source of truth for the admin UI, marketing copy, signup-form
// validation, and Prisma enum-shape checks.

/**
 * The complete set of unit types Compass supports. Mirrors the UnitType
 * Prisma enum exactly (signup validation + provision rely on this); add
 * a new program here only after adding the matching enum value.
 */
export const UNIT_TYPES = Object.freeze([
  "Troop",
  "Pack",
  "Crew",
  "Ship",
  "Post",
  "GirlScoutTroop",
]);

/**
 * What this unit type calls its youth subgroups, in lower-case for use
 * in copy ("which patrol does Liam belong to?") and an Uppercased label
 * for headings ("Patrols" / "Dens" / "Crews"). null = the unit type
 * doesn't conventionally subdivide.
 */
export const SUBGROUP_VOCAB = {
  Pack: { singular: "den", plural: "dens", heading: "Dens" },
  Troop: { singular: "patrol", plural: "patrols", heading: "Patrols" },
  Crew: { singular: "crew sub-group", plural: "crew sub-groups", heading: "Sub-groups" },
  Ship: { singular: "watch", plural: "watches", heading: "Watches" },
  Post: { singular: "post group", plural: "post groups", heading: "Groups" },
  // Girl Scout troops aren't always single-level, but the level still
  // identifies which program a Girl Scout is in and drives age-appropriate
  // activities, so we expose it as a subgroup.
  GirlScoutTroop: { singular: "level", plural: "levels", heading: "Levels" },
};

/**
 * For unit types whose subgroups have a fixed canonical list (Cub Scout
 * dens), the names are pinned. The admin UI offers them as the choices;
 * a unit can still create a custom one for an edge case.
 *
 * Troops, Crews, Ships, and Posts have free-form names — units pick.
 */
export const SUBGROUP_PRESETS = {
  Pack: [
    { key: "lion", label: "Lion", grade: "K" },
    { key: "tiger", label: "Tiger", grade: "1st" },
    { key: "wolf", label: "Wolf", grade: "2nd" },
    { key: "bear", label: "Bear", grade: "3rd" },
    { key: "webelos", label: "Webelos", grade: "4th" },
    { key: "arrow-of-light", label: "Arrow of Light", grade: "5th" },
  ],
  Troop: [],
  Crew: [],
  Ship: [],
  Post: [],
  GirlScoutTroop: [
    { key: "daisy", label: "Daisy", grade: "K–1" },
    { key: "brownie", label: "Brownie", grade: "2–3" },
    { key: "junior", label: "Junior", grade: "4–5" },
    { key: "cadette", label: "Cadette", grade: "6–8" },
    { key: "senior", label: "Senior", grade: "9–10" },
    { key: "ambassador", label: "Ambassador", grade: "11–12" },
  ],
};

/**
 * Typed leadership-position lists per unit type. The first three entries
 * are always {Unit-leader, Asst Unit-leader, Committee chair}. Adult vs.
 * youth column matters: youth positions show up in the patrol-leader
 * council surface; adult positions feed the YPT two-deep checks.
 *
 * The "Other" sentinel lets a unit type something custom — we save it
 * as the verbatim free-form string so the audit log keeps the admin's
 * intent.
 */
export const POSITIONS = {
  Pack: {
    adult: [
      "Cubmaster",
      "Assistant Cubmaster",
      "Committee Chair",
      "Committee Member",
      "Treasurer",
      "Secretary",
      "Den Leader",
      "Assistant Den Leader",
      "Pack Trainer",
      "Chartered Organization Representative",
      "Other",
    ],
    youth: [
      "Denner",
      "Assistant Denner",
      "Other",
    ],
  },
  Troop: {
    adult: [
      "Scoutmaster",
      "Assistant Scoutmaster",
      "Committee Chair",
      "Committee Member",
      "Treasurer",
      "Secretary",
      "Advancement Coordinator",
      "Outdoor Coordinator",
      "Chartered Organization Representative",
      "Other",
    ],
    youth: [
      "Senior Patrol Leader",
      "Assistant Senior Patrol Leader",
      "Patrol Leader",
      "Assistant Patrol Leader",
      "Troop Guide",
      "Quartermaster",
      "Scribe",
      "Historian",
      "Librarian",
      "Bugler",
      "Chaplain Aide",
      "Order of the Arrow Representative",
      "Junior Assistant Scoutmaster",
      "Den Chief",
      "Other",
    ],
  },
  Crew: {
    adult: [
      "Crew Advisor",
      "Associate Advisor",
      "Committee Chair",
      "Committee Member",
      "Treasurer",
      "Chartered Organization Representative",
      "Other",
    ],
    youth: [
      "Crew President",
      "Vice President of Administration",
      "Vice President of Program",
      "Secretary",
      "Treasurer",
      "Other",
    ],
  },
  Ship: {
    adult: [
      "Skipper",
      "Mate",
      "Committee Chair",
      "Committee Member",
      "Chartered Organization Representative",
      "Other",
    ],
    youth: [
      "Boatswain",
      "Boatswain's Mate",
      "Yeoman",
      "Purser",
      "Storekeeper",
      "Other",
    ],
  },
  Post: {
    adult: [
      "Post Advisor",
      "Associate Advisor",
      "Committee Chair",
      "Committee Member",
      "Other",
    ],
    youth: [
      "Post President",
      "Vice President",
      "Secretary",
      "Treasurer",
      "Other",
    ],
  },
  // Girl Scouts of the USA: troop volunteers carry the "leader" title and
  // service-unit titles handle multi-troop coordination. Older troops
  // (Cadette / Senior / Ambassador) elect officers; Daisy / Brownie /
  // Junior troops typically don't formalise positions.
  GirlScoutTroop: {
    adult: [
      "Troop Leader",
      "Co-Leader",
      "Troop Treasurer",
      "Cookie Manager",
      "Fall Product Manager",
      "Service Unit Manager",
      "Service Unit Treasurer",
      "Volunteer",
      "Other",
    ],
    youth: [
      "Troop President",
      "Vice President",
      "Secretary",
      "Treasurer",
      "Patrol Leader",
      "Other",
    ],
  },
};

// Falls back to Troop vocabulary on unknown unit types so a fresh enum
// addition without an entry here doesn't crash the admin UI.
export function subgroupVocab(unitType) {
  return SUBGROUP_VOCAB[unitType] || SUBGROUP_VOCAB.Troop;
}

export function subgroupPresets(unitType) {
  return SUBGROUP_PRESETS[unitType] || [];
}

// `audience` is "adult" | "youth"; omitted = the union (admin UI showing
// both together).
export function positionOptions(unitType, audience) {
  const tbl = POSITIONS[unitType] || POSITIONS.Troop;
  if (audience === "adult") return tbl.adult;
  if (audience === "youth") return tbl.youth;
  return [...new Set([...tbl.adult, ...tbl.youth])];
}

/**
 * Build the canonical Subgroup rows for an org as plain DTOs (no
 * persistence). Persistence is server/provision.js's job — keeping this
 * module free of Prisma so the vocabulary stays usable from tests and
 * the marketing page without a DB.
 */
export function buildSeedBroadcastChannels(unitType) {
  const presets = subgroupPresets(unitType);
  if (!presets.length) return [];
  const vocab = subgroupVocab(unitType);
  const singularCap = vocab.singular[0].toUpperCase() + vocab.singular.slice(1);
  return presets.map((p) => ({
    name: `${p.label} ${singularCap}`,
    description: `${p.label} (${p.grade}) ${vocab.singular}`,
    isYouth: true,
    patrols: [p.label],
  }));
}
