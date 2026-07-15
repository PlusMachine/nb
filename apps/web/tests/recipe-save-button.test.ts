import { describe, expect, it } from "vitest";

import { resolveSaveToastAction } from "../components/recipes/recipe-save-button";
import { countStockGaps } from "../components/recipes/recipe-match-panel";
import type { RecipeMatchLineDto } from "../features/recipes/contracts";

describe("resolveSaveToastAction — П2: тост после «В закладки» ведёт туда, где есть действие", () => {
  it("ведёт в список покупок, когда в рецепте есть нехватки", () => {
    expect(resolveSaveToastAction(3)).toEqual({ label: "Чего не хватает", href: "/app/shopping" });
    expect(resolveSaveToastAction(1)).toEqual({ label: "Чего не хватает", href: "/app/shopping" });
  });

  it("ведёт в закладки, когда нехваток нет", () => {
    expect(resolveSaveToastAction(0)).toEqual({ label: "Закладки", href: "/app/saved" });
  });

  it("ведёт в закладки, когда матч недоступен (null — витрина/аноним/матч ещё не загружен)", () => {
    expect(resolveSaveToastAction(null)).toEqual({ label: "Закладки", href: "/app/saved" });
  });
});

// Ф25 P1: тост «В закладки» на детальной странице должен считать нехватки той
// же семантикой, что и панель матча (missing ИЛИ partial через
// countStockGaps), а не серверный match.missingCount (только missing) — иначе
// для рецепта с одними partial-строками панель говорит «не хватает N», а тост
// вёл бы в закладки без ссылки на покупки.
describe("resolveSaveToastAction(countStockGaps(lines)) — Ф25: partial тоже считается нехваткой", () => {
  const baseLine = (overrides: Partial<RecipeMatchLineDto> = {}): RecipeMatchLineDto => ({
    recipeIngredientId: "ri-1",
    persistentKey: "ri-1-pk",
    displayOrder: 0,
    ingredientDisplayName: "Кориандр молотый",
    category: "consumable",
    brand: null,
    status: "covered",
    coveragePercent: 100,
    requiredQuantityNormalized: 10,
    availableQuantityNormalized: 10,
    shortfallNormalized: 0,
    normalizedUnit: "g",
    viaSubstitute: false,
    ingredientCatalogItemId: null,
    userCustomIngredientId: null,
    suggestedAddQuantity: null,
    suggestedAddUnit: null,
    ...overrides
  });

  it("рецепт с одними partial-строками (missingCount=0) всё равно ведёт на /app/shopping", () => {
    const lines = [baseLine({ status: "partial", coveragePercent: 50 })];

    expect(resolveSaveToastAction(countStockGaps(lines))).toEqual({ label: "Чего не хватает", href: "/app/shopping" });
  });

  it("рецепт без нехваток (всё covered/substitute) ведёт в закладки", () => {
    const lines = [baseLine({ status: "covered" }), baseLine({ recipeIngredientId: "ri-2", status: "substitute" })];

    expect(resolveSaveToastAction(countStockGaps(lines))).toEqual({ label: "Закладки", href: "/app/saved" });
  });
});
