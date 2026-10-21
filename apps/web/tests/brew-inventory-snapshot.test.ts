import { describe, expect, it } from "vitest";
import { buildBrewInventorySnapshot, readBrewInventorySnapshot } from "../features/brew-batches/inventory-snapshot";
import { scaleRecipeDetailForBrew } from "../features/recipes/scale";
import type { RecipeDetailDto, RecipeIngredientDto } from "../features/recipes/contracts";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n: number, fields: Partial<RecipeIngredientDto>): RecipeIngredientDto => ({
  id: uuid(n), recipeId: uuid(1), persistentKey: uuid(n + 100), displayOrder: n,
  ingredientCatalogItemId: `catalog-${n}`, userCustomIngredientId: null,
  type: "malt", ingredientCategory: "fermentable", amountEnteredQuantity: 6,
  amountEnteredUnit: "kg", amountNormalizedQuantity: 6000, amountNormalizedUnit: "g",
  stage: "mash", timeOffset: null, stepMeta: null,
  createdAt: new Date(), updatedAt: new Date(), ...fields
});
const recipe = (ingredients: RecipeIngredientDto[]): RecipeDetailDto => ({
  id: uuid(1), authorId: uuid(2), batchSizeEnteredQuantity: 30, batchSizeEnteredUnit: "l",
  batchSizeNormalizedQuantity: 30000, batchSizeNormalizedUnit: "ml", efficiency: 75,
  ingredients
} as RecipeDetailDto);

describe("persisted batch inventory snapshot", () => {
  it("keeps a hop's bilingual identity after persistence and catalog edits", () => {
    const source = recipe([row(11, { type: "hop", ingredientCategory: "hop", ingredientDisplayName: "Каскад", ingredientDisplayNameEn: "Cascade" })]);
    const frozen = JSON.parse(JSON.stringify(buildBrewInventorySnapshot(source, uuid(2))));
    source.ingredients[0].ingredientDisplayNameEn = "Changed catalog name";
    expect(readBrewInventorySnapshot({ inventory: frozen })?.lines[0].ingredientDisplayNameEnSnapshot).toBe("Cascade");
    delete frozen.lines[0].ingredientDisplayNameEnSnapshot;
    expect(readBrewInventorySnapshot({ inventory: frozen })?.lines[0].ingredientDisplayNameEnSnapshot).toBeNull();
  });
  it("freezes volume and mash-efficiency scaling exactly once", () => {
    const source = recipe([
      row(11, { ingredientTechnicalData: { type: "malt", fermentableClass: "grain" } }),
      row(12, { type: "fermentable", amountEnteredQuantity: 1, amountNormalizedQuantity: 1000, stage: "boil" }),
      row(13, { type: "hop", ingredientCategory: "hop", amountEnteredQuantity: 30, amountEnteredUnit: "g", amountNormalizedQuantity: 30, stage: "boil" })
    ]);
    const scaled = scaleRecipeDetailForBrew(source, { targetLitres: 20, targetEfficiencyPct: 65 });
    const snapshot = buildBrewInventorySnapshot(scaled, uuid(2));
    const persisted = JSON.parse(JSON.stringify({ inventory: snapshot }));
    const restored = readBrewInventorySnapshot(persisted)!;
    expect(restored.lines[0].amountNormalizedQuantity).toBeCloseTo(4615, 0);
    expect(restored.lines[1].amountNormalizedQuantity).toBeCloseTo(667, 0);
    expect(restored.lines[2].amountNormalizedQuantity).toBe(20);
    expect(source.ingredients[0].amountNormalizedQuantity).toBe(6000);
  });

  it("freezes the known content of a yeast package instead of rereading future catalog values", () => {
    const source = recipe([row(11, {
      type: "yeast", ingredientCategory: "yeast", amountEnteredQuantity: 2, amountEnteredUnit: "pack",
      amountNormalizedQuantity: 2, amountNormalizedUnit: "pack", stage: "fermentation",
      ingredientTechnicalData: { type: "yeast", form: "dry", packageSize: 12, packageUnit: "g" }
    })]);
    const snapshot = buildBrewInventorySnapshot(source, uuid(2));
    expect(snapshot.lines[0]).toMatchObject({ amountEnteredQuantity: 2, amountEnteredUnit: "pack", amountNormalizedQuantity: 24, amountNormalizedUnit: "g" });
    source.ingredients[0].ingredientTechnicalData = { type: "yeast", packageSize: 500, packageUnit: "g" };
    expect(readBrewInventorySnapshot({ inventory: snapshot })?.lines[0].amountNormalizedQuantity).toBe(24);
  });

  it("keeps only an owner's selected stock id and detaches it from mutable input", () => {
    const source = recipe([row(11, { inventorySelectionMeta: { inventoryItemId: uuid(40), privateNote: "not needed" } })]);
    const own = buildBrewInventorySnapshot(source, uuid(2));
    expect(own.lines[0].inventorySelectionMeta).toEqual({ inventoryItemId: uuid(40) });
    expect(buildBrewInventorySnapshot(source, uuid(3)).lines[0].inventorySelectionMeta).toBeNull();
    source.ingredients[0].inventorySelectionMeta!.inventoryItemId = uuid(41);
    expect(own.lines[0].inventorySelectionMeta?.inventoryItemId).toBe(uuid(40));
  });

  it("rejects corrupt quantities, duplicate identities and unknown snapshot versions", () => {
    const snapshot = buildBrewInventorySnapshot(recipe([row(11, {})]), uuid(2));
    for (const inventory of [
      { ...snapshot, version: 2 },
      { ...snapshot, lines: [...snapshot.lines, snapshot.lines[0]] },
      { ...snapshot, lines: [{ ...snapshot.lines[0], amountNormalizedQuantity: -1 }] },
      { ...snapshot, lines: [{ ...snapshot.lines[0], amountNormalizedQuantity: Infinity }] }
    ]) {
      expect(readBrewInventorySnapshot({ inventory })).toBeNull();
    }
  });
});
