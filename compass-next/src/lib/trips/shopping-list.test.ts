import { describe, expect, it } from "vitest";
import { buildShoppingList } from "./shopping-list";

describe("trips/buildShoppingList", () => {
  it("returns [] when headcount is 0", () => {
    expect(buildShoppingList([{ name: "x", ingredients: [] }], 0)).toEqual([]);
  });

  it("aggregates qty across meals; sorts by category order then alpha", () => {
    const meals = [
      {
        name: "Spaghetti",
        ingredients: [
          { name: "Onion", unit: "ea", category: "Produce", quantityPerPerson: 0.25 },
          { name: "Pasta", unit: "oz", category: "Pantry", quantityPerPerson: 4 },
        ],
      },
      {
        name: "Salad",
        ingredients: [
          { name: "onion", unit: "ea", category: "Produce", quantityPerPerson: 0.25 }, // same key
          { name: "Lettuce", unit: "head", category: "Produce", quantityPerPerson: 0.2 },
        ],
      },
    ];
    const groups = buildShoppingList(meals, 8);
    expect(groups.map((g) => g.category)).toEqual(["Produce", "Pantry"]);
    const produce = groups[0];
    expect(produce.items.find((i) => i.name === "Onion")?.quantity).toBe(4); // 0.25*8 + 0.25*8
    expect(produce.items.find((i) => i.name === "Onion")?.fromMeals.sort()).toEqual([
      "Salad",
      "Spaghetti",
    ]);
  });

  it("uncategorised entries default to 'Other' and sort last", () => {
    const groups = buildShoppingList(
      [
        {
          name: "x",
          ingredients: [
            { name: "Pepper", unit: "tbsp", category: null, quantityPerPerson: 1 },
            { name: "Salt", unit: "tbsp", category: "Pantry", quantityPerPerson: 1 },
          ],
        },
      ],
      4,
    );
    expect(groups[0].category).toBe("Pantry");
    expect(groups.at(-1)?.category).toBe("Other");
  });

  it("rounds clean integers (drop trailing zeros)", () => {
    const groups = buildShoppingList(
      [{ name: "m", ingredients: [{ name: "Eggs", unit: "ea", quantityPerPerson: 1 }] }],
      6,
    );
    const eggs = groups[0].items.find((i) => i.name === "Eggs");
    expect(eggs?.quantity).toBe(6);
  });
});
