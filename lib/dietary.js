// Recipe-level dietary tags ("contains" facts about a meal) and the
// rules that turn a roster member's dietary flags into automatic
// warnings on the trip planner. The flag set comes from the member
// admin UI (DIETARY_PRESETS) and is matched case-insensitively; free-form
// flags fall through silently — there's nothing to match them against.

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
];

const TAG_KEYS = new Set(MEAL_DIETARY_TAGS.map((t) => t.key));

// Member dietary flag (lowercased) → set of meal tags that conflict.
// Pork is treated as a subset of meat: a "vegetarian" hit on
// `contains-pork` would already be covered by `contains-meat`, so we
// don't double-report. The vegetarian rule includes pork explicitly to
// catch meals that only declare pork without the broader meat tag.
const FLAG_CONFLICTS = {
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

export function sanitizeMealTags(input) {
  if (!Array.isArray(input)) input = input == null ? [] : [input];
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const k = raw.trim().toLowerCase();
    if (!TAG_KEYS.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/**
 * For each member, return the set of conflicting (flag, tag) pairs the
 * given meal triggers. Members with no flags or no conflicts are
 * omitted from the returned list.
 *
 * @param {Array<{firstName:string, lastName:string, dietaryFlags:string[]}>} members
 * @param {string[]} mealTags
 * @returns {Array<{name:string, flag:string, tags:string[]}>}
 */
export function mealConflicts(members, mealTags) {
  if (!Array.isArray(mealTags) || mealTags.length === 0) return [];
  const tagSet = new Set(mealTags);
  const out = [];
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
