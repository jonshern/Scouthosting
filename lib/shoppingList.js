// Shopping list aggregator for the trip planner.
//
// Inputs: a TripPlan loaded with meals → ingredients, and a headcount.
// Output: a list grouped by category, where each entry is the sum of
//   `quantityPerPerson * headcount` across every meal that lists the
//   same (name, unit). Names are matched case-insensitively but the
//   first-seen capitalization wins for display.

export const CATEGORY_ORDER = [
  "Produce",
  "Meat",
  "Dairy",
  "Pantry",
  "Drinks",
  "Frozen",
  "Bakery",
  "Other",
];

const UNCATEGORIZED = "Other";

function key(name, unit) {
  return `${name.trim().toLowerCase()}|${unit.trim().toLowerCase()}`;
}

function roundQty(n) {
  // Keep a clean number for display: drop trailing zeros.
  if (!Number.isFinite(n)) return 0;
  if (Math.abs(n - Math.round(n)) < 0.01) return Math.round(n);
  return Math.round(n * 100) / 100;
}

export function buildShoppingList(meals, headcount) {
  const n = Math.max(0, Math.floor(headcount));
  if (n === 0 || !meals?.length) return [];

  const acc = new Map(); // key → entry
  for (const meal of meals) {
    for (const ing of meal.ingredients || []) {
      if (!ing.name?.trim() || !ing.unit?.trim()) continue;
      const k = key(ing.name, ing.unit);
      const cat = (ing.category || UNCATEGORIZED).trim() || UNCATEGORIZED;
      const qty = (ing.quantityPerPerson || 0) * n;
      if (!acc.has(k)) {
        acc.set(k, {
          name: ing.name.trim(),
          unit: ing.unit.trim(),
          category: cat,
          quantity: 0,
          fromMeals: new Set(),
        });
      }
      const e = acc.get(k);
      e.quantity += qty;
      e.fromMeals.add(meal.name);
      // First non-Other category wins; otherwise keep what we have.
      if (e.category === UNCATEGORIZED && cat !== UNCATEGORIZED) {
        e.category = cat;
      }
    }
  }

  // Group by category, sort categories by CATEGORY_ORDER then alpha.
  const groups = new Map();
  for (const e of acc.values()) {
    if (!groups.has(e.category)) groups.set(e.category, []);
    groups.get(e.category).push({
      name: e.name,
      unit: e.unit,
      quantity: roundQty(e.quantity),
      fromMeals: [...e.fromMeals],
    });
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }

  const orderIdx = new Map(CATEGORY_ORDER.map((c, i) => [c, i]));
  return [...groups.entries()]
    .sort(([a], [b]) => {
      const ai = orderIdx.has(a) ? orderIdx.get(a) : 999;
      const bi = orderIdx.has(b) ? orderIdx.get(b) : 999;
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    })
    .map(([category, items]) => ({ category, items }));
}
