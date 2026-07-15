import { describe, expect, it } from "vitest";

import { defaultRecipeProcessMeta, type RecipeDetailDto } from "../features/recipes/contracts";
import type { IngredientTechnicalData } from "../features/ingredients/contracts";
import { scaleRecipeDetailForBrew, scaleRecipeToVolume } from "../features/recipes/scale";

const dryYeastTechnicalData: IngredientTechnicalData = { type: "yeast", form: "dry" };
const liquidYeastTechnicalData: IngredientTechnicalData = { type: "yeast", form: "liquid" };

const buildRecipe = (overrides: Partial<RecipeDetailDto> = {}): RecipeDetailDto => ({
  id: "r-1",
  authorId: "u-1",
  recipeFamilyId: "rf-1",
  versionNumber: 1,
  versionCount: 1,
  publicationState: "published",
  hiddenAt: null,
  hiddenReason: null,
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
  authorDisplayName: null,
  processMeta: defaultRecipeProcessMeta,
  heroImageId: null,
  rating: null,
  versions: [],
  completedBrewCount: 0,
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

  it("rounds entered amounts to practical per-unit precision (no raw 3-decimal noise)", () => {
    // База 30 л → 25 л, factor 0.8333… — раньше давало 4.167 kg / 41.667 g.
    const view = scaleRecipeToVolume(
      buildRecipe({ batchSizeEnteredQuantity: 30, batchSizeNormalizedQuantity: 30000 }),
      25
    );
    expect(view.factor).toBeCloseTo(0.8333, 3);
    const [grain, hop] = view.ingredients;
    expect(grain.amountEnteredQuantity).toBe(4.17); // 5 kg → 2 знака, не 4.16667
    expect(hop.amountEnteredQuantity).toBe(41.7); // 50 g → 1 знак, не 41.6667
    expect(view.batchSizeEnteredQuantity).toBe(25); // 30 л → 2 знака
  });

  // Ф9 «граммы как факт» (решение владельца): дробной пачки не существует физически
  // («0.73 пачки» дрожжей нельзя отмерить). Пачка с известной граммовкой при
  // масштабировании конвертируется в вес; без граммовки (жидкие дрожжи, кастом) и
  // "item" (шт.) — округляется вверх до целой, минимум 1.
  describe("Ф9: пачки/штуки при масштабировании — «граммы как факт»", () => {
    const packYeast = (
      overrides: Partial<RecipeDetailDto["ingredients"][number]> = {}
    ): RecipeDetailDto["ingredients"][number] => ({
      id: "ri-yeast",
      recipeId: "r-1",
      persistentKey: "00000000-0000-4000-8000-000000000003",
      displayOrder: 2,
      ingredientCatalogItemId: "cat-3",
      userCustomIngredientId: null,
      type: "yeast" as const,
      ingredientCategory: "yeast" as const,
      ingredientDisplayName: "US-05",
      amountEnteredQuantity: 1,
      amountEnteredUnit: "pack" as const,
      amountNormalizedQuantity: 1,
      amountNormalizedUnit: "pack" as const,
      stage: "fermentation" as const,
      timeOffset: null,
      stepMeta: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      ...overrides
    });

    it("сухие дрожжи (граммовка 11 г известна) 30→22 л: 1 пачка → граммы, НЕ 0.73 пачки", () => {
      const recipe = buildRecipe({
        batchSizeEnteredQuantity: 30,
        batchSizeNormalizedQuantity: 30000,
        ingredients: [packYeast({ ingredientTechnicalData: dryYeastTechnicalData })]
      });

      const view = scaleRecipeToVolume(recipe, 22); // factor 22/30 = 0.7333…
      const [yeast] = view.ingredients;

      expect(yeast!.amountEnteredUnit).toBe("g");
      // 1 × 11 г × 0.7333… = 8.0667 г → округление до практичной точности "г" (1 знак).
      expect(yeast!.amountEnteredQuantity).toBeCloseTo(8.1, 1);
      expect(yeast!.amountNormalizedUnit).toBe("g");
      expect(yeast!.amountNormalizedQuantity).toBeCloseTo(8.067, 2);
    });

    it("сухие дрожжи 22→44 л (×2): граммы удваиваются, единица остаётся весовой", () => {
      const recipe = buildRecipe({
        batchSizeEnteredQuantity: 22,
        batchSizeNormalizedQuantity: 22000,
        ingredients: [packYeast({ ingredientTechnicalData: dryYeastTechnicalData })]
      });

      const view = scaleRecipeToVolume(recipe, 44);
      const [yeast] = view.ingredients;

      expect(view.factor).toBe(2);
      expect(yeast!.amountEnteredUnit).toBe("g");
      expect(yeast!.amountEnteredQuantity).toBe(22); // 11 г × 2
    });

    it("жидкие дрожжи без известной граммовки 30→22 л: остаются «1 пачка» (округление вверх)", () => {
      const recipe = buildRecipe({
        batchSizeEnteredQuantity: 30,
        batchSizeNormalizedQuantity: 30000,
        ingredients: [packYeast({ ingredientTechnicalData: liquidYeastTechnicalData })]
      });

      const view = scaleRecipeToVolume(recipe, 22); // factor 0.7333… — вниз
      const [yeast] = view.ingredients;

      expect(yeast!.amountEnteredUnit).toBe("pack");
      expect(yeast!.amountEnteredQuantity).toBe(1); // не 0.73, не 0
    });

    it("кастомный ингредиент без техданных (technicalData отсутствует) — тоже целая пачка", () => {
      const recipe = buildRecipe({
        batchSizeEnteredQuantity: 30,
        batchSizeNormalizedQuantity: 30000,
        ingredients: [packYeast()]
      });

      const view = scaleRecipeToVolume(recipe, 9); // factor 0.3
      expect(view.ingredients[0]!.amountEnteredUnit).toBe("pack");
      expect(view.ingredients[0]!.amountEnteredQuantity).toBe(1);
    });

    it("item (шт., напр. таблетки) — всегда целое число, минимум 1", () => {
      const recipe = buildRecipe({
        batchSizeEnteredQuantity: 30,
        batchSizeNormalizedQuantity: 30000,
        ingredients: [packYeast({
          type: "consumable",
          ingredientCategory: "consumable",
          amountEnteredUnit: "item",
          amountNormalizedUnit: "item"
        })]
      });

      const view = scaleRecipeToVolume(recipe, 22); // factor 0.7333…, 1 × 0.7333 = 0.73 без округления
      expect(view.ingredients[0]!.amountEnteredUnit).toBe("item");
      expect(view.ingredients[0]!.amountEnteredQuantity).toBe(1);
    });

    it("масштаб не применяется (factor 1) — строка не трогается: «1 пачка», не «11 г»", () => {
      const recipe = buildRecipe({
        batchSizeEnteredQuantity: 30,
        batchSizeNormalizedQuantity: 30000,
        ingredients: [packYeast({ ingredientTechnicalData: dryYeastTechnicalData })]
      });

      const view = scaleRecipeToVolume(recipe, 30);
      expect(view.factor).toBe(1);
      expect(view.ingredients[0]!.amountEnteredUnit).toBe("pack");
      expect(view.ingredients[0]!.amountEnteredQuantity).toBe(1);
    });

    it("характеризационный: scaleRecipeDetailForBrew конвертирует пачку дрожжей при варке в другом объёме", () => {
      const recipe = buildRecipe({
        batchSizeEnteredQuantity: 30,
        batchSizeNormalizedQuantity: 30000,
        ingredients: [packYeast({ ingredientTechnicalData: dryYeastTechnicalData })]
      });

      const scaled = scaleRecipeDetailForBrew(recipe, { targetLitres: 22 });
      const [yeast] = scaled.ingredients;

      expect(yeast!.amountEnteredUnit).toBe("g");
      expect(yeast!.amountEnteredQuantity).toBeCloseTo(8.1, 1);
      expect(yeast!.amountNormalizedUnit).toBe("g");
    });

    it("характеризационный: scaleRecipeDetailForBrew без targetLitres (варка на своём объёме) не трогает пачку", () => {
      const recipe = buildRecipe({
        batchSizeEnteredQuantity: 30,
        batchSizeNormalizedQuantity: 30000,
        ingredients: [packYeast({ ingredientTechnicalData: dryYeastTechnicalData })]
      });

      const scaled = scaleRecipeDetailForBrew(recipe, {});
      expect(scaled.ingredients[0]!.amountEnteredUnit).toBe("pack");
      expect(scaled.ingredients[0]!.amountEnteredQuantity).toBe(1);
    });
  });
});
