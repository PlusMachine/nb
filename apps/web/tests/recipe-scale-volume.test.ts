import { describe, expect, it } from "vitest";

import { defaultRecipeProcessMeta, type RecipeDetailDto } from "../features/recipes/contracts";
import { scaleRecipeToVolume } from "../features/recipes/scale";

const buildRecipe = (overrides: Partial<RecipeDetailDto> = {}): RecipeDetailDto => ({
  id: "r-1",
  authorId: "u-1",
  recipeFamilyId: "rf-1",
  versionNumber: 1,
  versionCount: 1,
  publicationState: "published",
  title: "Base IPA",
  slug: "base-ipa",
  styleId: null,
  batchSizeEnteredQuantity: 20,
  batchSizeEnteredUnit: "l",
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  efficiency: 75,
  boilTimeMinutes: 60,
  og: 1.06,
  fg: 1.012,
  abv: 6.2,
  ibu: 45,
  color: 9.5,
  description: null,
  authorNotes: null,
  processMeta: defaultRecipeProcessMeta,
  heroImageId: null,
  rating: null,
  versions: [],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  ingredients: [
    {
      id: "ri-grain",
      recipeId: "r-1",
      persistentKey: "00000000-0000-4000-8000-000000000001",
      displayOrder: 0,
      ingredientCatalogItemId: "cat-1",
      userCustomIngredientId: null,
      type: "fermentable",
      ingredientDisplayName: "Pale Malt",
      amountEnteredQuantity: 5,
      amountEnteredUnit: "kg",
      amountNormalizedQuantity: 5000,
      amountNormalizedUnit: "g",
      stage: "mash",
      timeOffset: null,
      stepMeta: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    },
    {
      id: "ri-hop",
      recipeId: "r-1",
      persistentKey: "00000000-0000-4000-8000-000000000002",
      displayOrder: 1,
      ingredientCatalogItemId: "cat-2",
      userCustomIngredientId: null,
      type: "hop",
      ingredientDisplayName: "Citra",
      amountEnteredQuantity: 50,
      amountEnteredUnit: "g",
      amountNormalizedQuantity: 50,
      amountNormalizedUnit: "g",
      stage: "boil",
      timeOffset: 15,
      stepMeta: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    }
  ],
  ...overrides
});

describe("scaleRecipeToVolume", () => {
  it("scales ingredient amounts and batch size proportionally (×2)", () => {
    const view = scaleRecipeToVolume(buildRecipe(), 40);

    expect(view.factor).toBe(2);
    expect(view.scaled).toBe(true);
    expect(view.targetBatchLitres).toBe(40);
    expect(view.batchSizeEnteredQuantity).toBe(40);

    const [grain, hop] = view.ingredients;
    expect(grain.amountEnteredQuantity).toBe(10); // 5 kg → 10 kg
    expect(grain.amountNormalizedQuantity).toBe(10000);
    expect(grain.amountEnteredUnit).toBe("kg"); // единица сохраняется
    expect(hop.amountEnteredQuantity).toBe(100); // 50 g → 100 g
  });

  it("scales down for a smaller batch (×0.5)", () => {
    const view = scaleRecipeToVolume(buildRecipe(), 10);

    expect(view.factor).toBe(0.5);
    expect(view.ingredients[0].amountEnteredQuantity).toBe(2.5);
    expect(view.ingredients[1].amountEnteredQuantity).toBe(25);
  });

  it("does NOT change intensive properties and does NOT mutate the source recipe", () => {
    const recipe = buildRecipe();
    const view = scaleRecipeToVolume(recipe, 60);

    // масштаб не возвращает интенсивные свойства — это презентация количеств
    expect(view).not.toHaveProperty("og");
    expect(view).not.toHaveProperty("abv");
    expect(view).not.toHaveProperty("ibu");

    // исходный рецепт нетронут (чистая функция)
    expect(recipe.og).toBe(1.06);
    expect(recipe.abv).toBe(6.2);
    expect(recipe.ingredients[0].amountEnteredQuantity).toBe(5);
    expect(recipe.batchSizeEnteredQuantity).toBe(20);
  });

  it("returns factor 1 (no change) for the base volume", () => {
    const view = scaleRecipeToVolume(buildRecipe(), 20);

    expect(view.factor).toBe(1);
    expect(view.scaled).toBe(false);
    expect(view.ingredients[0].amountEnteredQuantity).toBe(5);
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    "treats invalid target %p as no-op (factor 1)",
    (target) => {
      const view = scaleRecipeToVolume(buildRecipe(), target as number);

      expect(view.factor).toBe(1);
      expect(view.scaled).toBe(false);
      expect(view.ingredients[0].amountEnteredQuantity).toBe(5);
    }
  );

  it("clamps an absurdly large target to the cap (1000 L)", () => {
    const view = scaleRecipeToVolume(buildRecipe(), 5000);

    expect(view.targetBatchLitres).toBe(1000);
    expect(view.factor).toBe(50); // 1000 / 20
  });

  it("falls back to factor 1 when the base batch volume is unusable", () => {
    const view = scaleRecipeToVolume(buildRecipe({ batchSizeNormalizedQuantity: 0 }), 40);

    expect(view.factor).toBe(1);
    expect(view.ingredients[0].amountEnteredQuantity).toBe(5);
  });
});
