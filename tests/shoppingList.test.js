import { describe, it, expect } from "vitest";
import { buildShoppingList, CATEGORY_ORDER } from "../lib/shoppingList.js";

const breakfast = {
  name: "Saturday breakfast",
  ingredients: [
    { name: "Eggs", quantityPerPerson: 2, unit: "ea", category: "Dairy" },
    { name: "Bacon", quantityPerPerson: 0.25, unit: "lb", category: "Meat" },
    { name: "Bread", quantityPerPerson: 2, unit: "ea", category: "Bakery" },
  ],
};
const dinner = {
  name: "Saturday dinner",
  ingredients: [
    { name: "Ground beef", quantityPerPerson: 0.25, unit: "lb", category: "Meat" },
    { name: "Spaghetti", quantityPerPerson: 0.2, unit: "lb", category: "Pantry" },
    { name: "Bread", quantityPerPerson: 1, unit: "ea", category: "Bakery" },
  ],
};

describe("buildShoppingList", () => {
  it("returns [] for headcount=0 or empty meals", () => {
    expect(buildShoppingList([], 12)).toEqual([]);
    expect(buildShoppingList([breakfast], 0)).toEqual([]);
  });

  it("aggregates same (name, unit) across meals × headcount", () => {
    const out = buildShoppingList([breakfast, dinner], 12);
    const all = out.flatMap((g) => g.items);
    const bread = all.find((i) => i.name === "Bread");
    expect(bread).toBeDefined();
    expect(bread.unit).toBe("ea");
    expect(bread.quantity).toBe(36); // (2 + 1) * 12
    expect(bread.fromMeals.sort()).toEqual(["Saturday breakfast", "Saturday dinner"]);
  });

  it("groups by category in the canonical order", () => {
    const out = buildShoppingList([breakfast, dinner], 1);
    const cats = out.map((g) => g.category);
    // Filter CATEGORY_ORDER to only those present, then assert they're in that order.
    const expected = CATEGORY_ORDER.filter((c) => cats.includes(c));
    expect(cats).toEqual(expected);
  });

  it("alphabetises items inside a category", () => {
    const out = buildShoppingList([breakfast, dinner], 1);
    const meat = out.find((g) => g.category === "Meat");
    expect(meat.items.map((i) => i.name)).toEqual(["Bacon", "Ground beef"]);
  });

  it("rounds quantities to two decimals (and integers stay clean)", () => {
    const out = buildShoppingList(
      [{ name: "X", ingredients: [{ name: "Cheese", quantityPerPerson: 0.333, unit: "lb", category: "Dairy" }] }],
      3
    );
    const cheese = out[0].items[0];
    expect(cheese.quantity).toBe(1); // 0.333 * 3 = 0.999 → 1
  });

  it("falls back to 'Other' when category missing", () => {
    const out = buildShoppingList(
      [{ name: "X", ingredients: [{ name: "Salt", quantityPerPerson: 1, unit: "tsp" }] }],
      4
    );
    expect(out[0].category).toBe("Other");
  });

  it("ignores ingredients missing name or unit", () => {
    const out = buildShoppingList(
      [{ name: "X", ingredients: [{ name: "  ", quantityPerPerson: 1, unit: "ea" }, { name: "Eggs", unit: "" }] }],
      2
    );
    expect(out).toEqual([]);
  });

  it("matches names case-insensitively but keeps first-seen capitalization", () => {
    const out = buildShoppingList(
      [
        { name: "M1", ingredients: [{ name: "Cheese", quantityPerPerson: 1, unit: "lb", category: "Dairy" }] },
        { name: "M2", ingredients: [{ name: "cheese", quantityPerPerson: 0.5, unit: "lb", category: "Dairy" }] },
      ],
      2
    );
    const items = out[0].items;
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Cheese");
    expect(items[0].quantity).toBe(3);
  });
});
