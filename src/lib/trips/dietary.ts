// Recipe-level dietary tags ("contains" facts about a meal) and the
// rules that turn a roster member's dietary flags into automatic
// warnings on the trip planner.

export const MEAL_DIETARY_TAGS = [
  { key: "contains-meat", label: "Contains meat" },
  { key: "contains-pork", label: "Contains pork" },
  { key: "contains-fish", label: "Contains fish" },
  { key: "contains-shellfish", label: "Contains shellfish" },
  { key: "contains-dairy", label: "Contains dairy" },
  { key: "contains-egg", label: "Contains egg" },
  { key: "contains-gluten", label: "Contains gluten" },
  { key: "contains-nut", label: "Contains tree nuts" },
  { key: "contains-peanut", label: "Contains peanuts" },
  { key: "contains-soy", label: "Contains soy" },
  { key: "contains-alcohol", label: "Contains alcohol" },
] as const;

const TAG_KEYS = new Set(MEAL_DIETARY_TAGS.map((t) => t.key));

const FLAG_CONFLICTS: Record<string, string[]> = {
  vegetarian: ["contains-meat", "contains-pork", "contains-fish", "contains-shellfish"],
  vegan: [
    "contains-meat",
    "contains-pork",
    "contains-fish",
    "contains-shellfish",
    "contains-dairy",
    "contains-egg",
  ],
  "gluten-free": ["contains-gluten"],
  "dairy-free": ["contains-dairy"],
  "nut allergy": ["contains-nut", "contains-peanut"],
  "shellfish allergy": ["contains-shellfish"],
  "egg allergy": ["contains-egg"],
  halal: ["contains-pork", "contains-alcohol"],
  kosher: ["contains-pork", "contains-shellfish"],
};

export function sanitizeMealTags(input: unknown): string[] {
  const arr = Array.isArray(input) ? input : input == null ? [] : [input];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of arr) {
    if (typeof raw !== "string") continue;
    const k = raw.trim().toLowerCase();
    if (!TAG_KEYS.has(k as never) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

export type DietaryMember = {
  firstName: string;
  lastName: string;
  dietaryFlags?: string[] | null;
};

export type DietaryConflict = { name: string; flag: string; tags: string[] };

export function mealConflicts(
  members: ReadonlyArray<DietaryMember>,
  mealTags: string[],
): DietaryConflict[] {
  if (!Array.isArray(mealTags) || mealTags.length === 0) return [];
  const tagSet = new Set(mealTags);
  const out: DietaryConflict[] = [];
  for (const m of members) {
    for (const flag of m.dietaryFlags || []) {
      const conflicts = FLAG_CONFLICTS[flag.toLowerCase()];
      if (!conflicts) continue;
      const hit = conflicts.filter((t) => tagSet.has(t));
      if (hit.length === 0) continue;
      out.push({
        name: `${m.firstName} ${m.lastName}`.trim(),
        flag,
        tags: hit,
      });
    }
  }
  return out;
}
