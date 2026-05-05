// Unit-type-aware roles + subgroup vocabulary.
//
// Different programs use different language for the same idea. Single
// source of truth for the admin UI, marketing copy, signup-form
// validation, and Prisma enum-shape checks.

export const UNIT_TYPES = [
  "Troop",
  "Pack",
  "Crew",
  "Ship",
  "Post",
  "GirlScoutTroop",
] as const;

export type UnitType = (typeof UNIT_TYPES)[number];

export type SubgroupVocab = { singular: string; plural: string; heading: string };

export const SUBGROUP_VOCAB: Record<UnitType, SubgroupVocab> = {
  Pack: { singular: "den", plural: "dens", heading: "Dens" },
  Troop: { singular: "patrol", plural: "patrols", heading: "Patrols" },
  Crew: { singular: "crew sub-group", plural: "crew sub-groups", heading: "Sub-groups" },
  Ship: { singular: "watch", plural: "watches", heading: "Watches" },
  Post: { singular: "post group", plural: "post groups", heading: "Groups" },
  GirlScoutTroop: { singular: "level", plural: "levels", heading: "Levels" },
};

export type SubgroupPreset = { key: string; label: string; grade: string };

export const SUBGROUP_PRESETS: Record<UnitType, SubgroupPreset[]> = {
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

type PositionSet = { adult: string[]; youth: string[] };

export const POSITIONS: Record<UnitType, PositionSet> = {
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
    youth: ["Denner", "Assistant Denner", "Other"],
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
    youth: ["Post President", "Vice President", "Secretary", "Treasurer", "Other"],
  },
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
    youth: ["Troop President", "Vice President", "Secretary", "Treasurer", "Patrol Leader", "Other"],
  },
};

export function subgroupVocab(unitType: string | null | undefined): SubgroupVocab {
  return SUBGROUP_VOCAB[unitType as UnitType] || SUBGROUP_VOCAB.Troop;
}

export function subgroupPresets(unitType: string | null | undefined): SubgroupPreset[] {
  return SUBGROUP_PRESETS[unitType as UnitType] || [];
}

export function positionOptions(
  unitType: string | null | undefined,
  audience?: "adult" | "youth",
): string[] {
  const tbl = POSITIONS[unitType as UnitType] || POSITIONS.Troop;
  if (audience === "adult") return tbl.adult;
  if (audience === "youth") return tbl.youth;
  return [...new Set([...tbl.adult, ...tbl.youth])];
}

export type SeedBroadcastChannel = {
  name: string;
  description: string;
  isYouth: boolean;
  patrols: string[];
  audience: "parents-of-youth" | "all" | "adults" | "youth";
};

export function buildSeedBroadcastChannels(unitType: string | null | undefined): SeedBroadcastChannel[] {
  const presets = subgroupPresets(unitType);
  if (!presets.length) return [];
  const vocab = subgroupVocab(unitType);
  const singularCap = vocab.singular[0].toUpperCase() + vocab.singular.slice(1);
  // Pack and Girl Scout Troop youth are too young for direct contact —
  // contact info is the parents'. Broadcasts to a den/level resolve to
  // the *parents* of the youth in that section.
  return presets.map((p) => ({
    name: `${p.label} ${singularCap}`,
    description: `Parents of ${p.label} (${p.grade}) ${vocab.singular} youth`,
    isYouth: true,
    patrols: [p.label],
    audience: "parents-of-youth",
  }));
}
