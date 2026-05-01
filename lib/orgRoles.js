// Unit-type-aware roles + subgroup vocabulary.
//
// Different BSA programs use different language for the same idea:
//   - Cub Scout Pack → leaders are "Cubmaster" + "Den Leader"; youth are
//     organized into rank-named **dens** (Lion, Tiger, Wolf, Bear, Webelos,
//     Arrow of Light).
//   - Scouts BSA Troop → leaders are "Scoutmaster" + "ASM"; youth are
//     organized into free-form **patrols** (the unit picks the names).
//   - Venturing Crew / Sea Scout Ship / Exploring Post → leaders use
//     "Advisor"/"Skipper"/"Advisor"; youth typically don't subdivide into
//     dens or patrols at the same granularity.
//
// This module is the single source of truth so the admin UI, the marketing
// page, and any future schema validation all agree.

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
};

/**
 * Resolve subgroup vocabulary for an org. Falls back to the Troop
 * vocabulary if an unknown unit type is passed (defensive — we control
 * the enum, but a fresh org type added without updating this module
 * shouldn't crash the admin UI).
 */
export function subgroupVocab(unitType) {
  return SUBGROUP_VOCAB[unitType] || SUBGROUP_VOCAB.Troop;
}

/**
 * Subgroup preset list for an org (e.g. Lion/Tiger/Wolf/... for a Pack,
 * empty for a Troop). The admin UI uses this to seed a fresh org's
 * subgroup table and to suggest a pick-list when creating new ones.
 */
export function subgroupPresets(unitType) {
  return SUBGROUP_PRESETS[unitType] || [];
}

/**
 * Position option list. `audience` is "adult" | "youth". Non-adult /
 * non-youth audiences fall back to the union (admin UI displaying both
 * together).
 */
export function positionOptions(unitType, audience) {
  const tbl = POSITIONS[unitType] || POSITIONS.Troop;
  if (audience === "adult") return tbl.adult;
  if (audience === "youth") return tbl.youth;
  return [...new Set([...tbl.adult, ...tbl.youth])];
}

/**
 * Returns true if this unit type's subgroups have a fixed canonical
 * vocabulary (so the admin UI should default to a pick-list instead of
 * a free-form text input).
 */
export function hasFixedSubgroups(unitType) {
  return (SUBGROUP_PRESETS[unitType] || []).length > 0;
}
