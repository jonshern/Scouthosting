// Shopping list aggregator for the trip planner.
//
// Inputs: a TripPlan loaded with meals → ingredients, and a headcount.
// Output: a list grouped by category, where each entry is the sum of
//   `quantityPerPerson * headcount` across every meal that lists the
//   same (name, unit). Names match case-insensitively but the
//   first-seen capitalisation wins for display.

export const CATEGORY_ORDER: ReadonlyArray<string> = [
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

export type Ingredient = {
  name?: string | null;
  unit?: string | null;
  category?: string | null;
  quantityPerPerson?: number | null;
};

export type Meal = {
  name: string;
  ingredients?: ReadonlyArray<Ingredient> | null;
};

export type ShoppingItem = {
  name: string;
  unit: string;
  quantity: number;
  fromMeals: string[];
};

export type ShoppingGroup = { category: string; items: ShoppingItem[] };

function key(name: string, unit: string): string {
  return `${name.trim().toLowerCase()}|${unit.trim().toLowerCase()}`;
}

function roundQty(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (Math.abs(n - Math.round(n)) < 0.01) return Math.round(n);
  return Math.round(n * 100) / 100;
}

export function buildShoppingList(
  meals: ReadonlyArray<Meal> | null | undefined,
  headcount: number,
): ShoppingGroup[] {
  const n = Math.max(0, Math.floor(headcount));
  if (n === 0 || !meals?.length) return [];

  type AccEntry = {
    name: string;
    unit: string;
    category: string;
    quantity: number;
    fromMeals: Set<string>;
  };
  const acc = new Map<string, AccEntry>();
  for (const meal of meals) {
    for (const ing of meal.ingredients || []) {
      if (!ing.name?.trim() || !ing.unit?.trim()) continue;
      const k = key(ing.name, ing.unit);
      const cat = (ing.category || UNCATEGORIZED).trim() || UNCATEGORIZED;
      const qty = (ing.quantityPerPerson || 0) * n;
      let e = acc.get(k);
      if (!e) {
        e = {
          name: ing.name.trim(),
          unit: ing.unit.trim(),
          category: cat,
          quantity: 0,
          fromMeals: new Set(),
        };
        acc.set(k, e);
      }
      e.quantity += qty;
      e.fromMeals.add(meal.name);
      if (e.category === UNCATEGORIZED && cat !== UNCATEGORIZED) {
        e.category = cat;
      }
    }
  }

  const groups = new Map<string, ShoppingItem[]>();
  for (const e of acc.values()) {
    if (!groups.has(e.category)) groups.set(e.category, []);
    groups.get(e.category)!.push({
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
      const ai = orderIdx.has(a) ? orderIdx.get(a)! : 999;
      const bi = orderIdx.has(b) ? orderIdx.get(b)! : 999;
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    })
    .map(([category, items]) => ({ category, items }));
}
