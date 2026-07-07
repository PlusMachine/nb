import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";

vi.mock("@nb/db", () => ({
  db: { query: { recipes: { findMany: vi.fn() }, ingredients: { findMany: vi.fn() } } },
  ingredients: {},
  recipeIngredients: {},
  recipes: {},
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn()
}));
vi.mock("../features/recipes/service", () => ({ getRecipeById: vi.fn() }));
vi.mock("../features/inventory/service", () => ({ listInventoryForUser: vi.fn() }));
vi.mock("../features/equipment-profiles/service", () => ({ listEquipmentProfiles: vi.fn() }));
// FIX-3 fault injection: настоящий roundTo никогда не получает отрицательное
// значение на легальных данных (нормализованные количества валидируются как
// ≥0 при сохранении рецепта) — здесь отрицательное значение служит маркером
// «повреждённой» строки рецепта, чтобы смоделировать реальный throw внутри
// цикла матчинга computeRecipeMatchesForUser, не выдумывая тест-пустышку.
// Для всех остальных значений (весь реальный матчинг в этом файле оперирует
// неотрицательными количествами) поведение не отличается от настоящего roundTo.
vi.mock("@nb/brewing-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nb/brewing-core")>();
  return {
    ...actual,
    roundTo: (value: number, digits?: number) => {
      if (value < 0) {
        throw new Error("[test] simulated corrupt recipe line");
      }
      return actual.roundTo(value, digits);
    }
  };
});

import {
  computeRecipeMatch,
  computeRecipeMatchesForUser,
  indexInventoryEntries,
  matchLineAgainstInventory,
  summarizeMatch,
  type InventoryMatchEntry,
  type MatchLineInput
} from "../features/recipes/match-service";
import { resolveIngredientMatchKey, type IngredientMatchProfile } from "../features/ingredients/match-group";
import { db, inArray } from "@nb/db";
import { getRecipeById } from "../features/recipes/service";
import { listInventoryForUser } from "../features/inventory/service";
import { listEquipmentProfiles } from "../features/equipment-profiles/service";

const pilsnerProfile = (catalogItemId: string): IngredientMatchProfile => ({
  category: "fermentable",
  type: "malt",
  name: "Pilsner",
  nameEn: "Pilsner",
  technicalData: { type: "malt", maltType: "base", colorEbcMin: 2, colorEbcMax: 4 },
  catalogItemId,
  dimension: "weight"
});

const yeastProfile = (catalogItemId: string): IngredientMatchProfile => ({
  category: "yeast",
  type: "yeast",
  name: "US-05",
  catalogItemId,
  dimension: "count",
  technicalData: { type: "yeast", yeastFamily: "US-05", form: "dry" }
});

const entry = (
  itemId: string,
  profile: IngredientMatchProfile,
  available: number,
  normalizedUnit: InventoryMatchEntry["normalizedUnit"]
): InventoryMatchEntry => ({
  itemId,
  key: resolveIngredientMatchKey(profile),
  available,
  normalizedUnit
});

const line = (
  profile: IngredientMatchProfile,
  required: number,
  normalizedUnit: MatchLineInput["normalizedUnit"]
): MatchLineInput => ({
  id: "line-1",
  persistentKey: "line-1-pk",
  displayOrder: 0,
  displayName: profile.name ?? null,
  profile,
  requiredNormalizedQuantity: required,
  normalizedUnit
});

describe("matchLineAgainstInventory — core semantics", () => {
  it("aggregates multiple bags of the exact product and scales the requirement", () => {
    const index = indexInventoryEntries([
      entry("bag-1", pilsnerProfile("kursk--pilsner"), 6000, "g"),
      entry("bag-2", pilsnerProfile("kursk--pilsner"), 5000, "g")
    ]);

    // recipe needs 5000g at the authored volume; matching at 2x batch → 10000g
    const result = matchLineAgainstInventory(line(pilsnerProfile("kursk--pilsner"), 5000, "g"), index, 2);

    expect(result.requiredQuantityNormalized).toBe(10000);
    expect(result.availableQuantityNormalized).toBe(11000);
    expect(result.status).toBe("covered");
    expect(result.coveragePercent).toBe(100);
    expect(result.viaSubstitute).toBe(false);
  });

  it("covers via a different brand of the same pilsner (substitute tier)", () => {
    const index = indexInventoryEntries([
      entry("bag-1", pilsnerProfile("soufflet--pilsner"), 12000, "g")
    ]);

    const result = matchLineAgainstInventory(line(pilsnerProfile("kursk--pilsner"), 5000, "g"), index, 1);

    expect(result.status).toBe("substitute");
    expect(result.viaSubstitute).toBe(true);
    expect(result.coveragePercent).toBe(100);
  });

  it("reports a partial cover with shortfall", () => {
    const index = indexInventoryEntries([
      entry("bag-1", pilsnerProfile("kursk--pilsner"), 4000, "g")
    ]);

    const result = matchLineAgainstInventory(line(pilsnerProfile("kursk--pilsner"), 10000, "g"), index, 1);

    expect(result.status).toBe("partial");
    expect(result.coveragePercent).toBe(40);
    expect(result.shortfallNormalized).toBe(6000);
  });

  it("returns missing when nothing matches", () => {
    const index = indexInventoryEntries([
      entry("bag-1", pilsnerProfile("kursk--pilsner"), 4000, "g")
    ]);

    const munich: IngredientMatchProfile = {
      ...pilsnerProfile("any--munich"),
      name: "Munich",
      nameEn: "Munich",
      technicalData: { type: "malt", maltType: "base", colorEbcMin: 14, colorEbcMax: 18 }
    };
    const result = matchLineAgainstInventory(line(munich, 1000, "g"), index, 1);

    expect(result.status).toBe("missing");
    expect(result.coveragePercent).toBe(0);
  });

  it("does not match across measurement dimensions", () => {
    // same group key, but inventory is tracked by count while the line needs weight
    const countEntry = entry("c-1", { ...pilsnerProfile("kursk--pilsner"), dimension: "count" }, 5, "pack");
    const index = indexInventoryEntries([countEntry]);

    const result = matchLineAgainstInventory(line(pilsnerProfile("kursk--pilsner"), 1000, "g"), index, 1);

    expect(result.status).toBe("missing");
  });

  it("treats yeast as exact-only (no cross-strain substitution)", () => {
    const index = indexInventoryEntries([
      entry("y-1", yeastProfile("fermentis--us-05"), 5, "pack")
    ]);

    // different catalog id, same family — must NOT substitute for yeast
    const result = matchLineAgainstInventory(line(yeastProfile("lallemand--us-05-clone"), 2, "pack"), index, 1);

    expect(result.status).toBe("missing");
  });

  it("covers yeast by presence across units: recipe in packs, inventory in grams", () => {
    // тот же штамм на складе, но нормализован в граммы (weight), а строка — в
    // паках (count). Раньше это давало ложное «нет»; теперь покрыто по наличию.
    const index = indexInventoryEntries([
      entry("y-g", { ...yeastProfile("fermentis--us-05"), dimension: "weight" }, 33, "g")
    ]);

    const result = matchLineAgainstInventory(line(yeastProfile("fermentis--us-05"), 1, "pack"), index, 1);

    expect(result.status).toBe("covered");
    expect(result.coveragePercent).toBe(100);
    expect(result.shortfallNormalized).toBe(0);
    expect(result.viaSubstitute).toBe(false);
  });

  it("covers yeast by presence regardless of quantity (one pack is enough)", () => {
    const index = indexInventoryEntries([
      entry("y-1", yeastProfile("fermentis--us-05"), 1, "pack")
    ]);

    // строка требует 3 пакета, на складе 1 — для дрожжей наличие штамма = покрыто
    const result = matchLineAgainstInventory(line(yeastProfile("fermentis--us-05"), 3, "pack"), index, 1);

    expect(result.status).toBe("covered");
    expect(result.coveragePercent).toBe(100);
  });

  it("keeps yeast missing when the strain is not on the shelf", () => {
    const index = indexInventoryEntries([
      entry("y-1", yeastProfile("fermentis--us-05"), 2, "pack")
    ]);

    const result = matchLineAgainstInventory(line(yeastProfile("lallemand--belle-saison"), 1, "pack"), index, 1);

    expect(result.status).toBe("missing");
    expect(result.coveragePercent).toBe(0);
  });
});

describe("matchLineAgainstInventory — add-to-inventory suggestion", () => {
  it("exposes the catalog id and a human add-suggestion (g→kg) for a missing malt", () => {
    const result = matchLineAgainstInventory(line(pilsnerProfile("kursk--pilsner"), 1000, "g"), indexInventoryEntries([]), 1);

    expect(result.status).toBe("missing");
    expect(result.ingredientCatalogItemId).toBe("kursk--pilsner");
    expect(result.userCustomIngredientId).toBeNull();
    // нехватка 1000 г → 1 кг (человеческая единица для солода)
    expect(result.suggestedAddUnit).toBe("kg");
    expect(result.suggestedAddQuantity).toBe(1);
  });

  it("suggests pack quantity for a missing yeast", () => {
    const result = matchLineAgainstInventory(line(yeastProfile("fermentis--us-05"), 2, "pack"), indexInventoryEntries([]), 1);

    expect(result.status).toBe("missing");
    expect(result.ingredientCatalogItemId).toBe("fermentis--us-05");
    expect(result.suggestedAddUnit).toBe("pack");
    expect(result.suggestedAddQuantity).toBe(2);
  });

  it("has no add-suggestion for a fully covered line", () => {
    const index = indexInventoryEntries([entry("bag", pilsnerProfile("kursk--pilsner"), 9000, "g")]);
    const result = matchLineAgainstInventory(line(pilsnerProfile("kursk--pilsner"), 5000, "g"), index, 1);

    expect(result.status).toBe("covered");
    expect(result.suggestedAddQuantity).toBeNull();
    expect(result.suggestedAddUnit).toBeNull();
  });
});

describe("summarizeMatch — weighted percentage", () => {
  it("weights a missing base malt / yeast more than a covered pinch of salt", () => {
    const fermentableCovered = matchLineAgainstInventory(
      line(pilsnerProfile("kursk--pilsner"), 5000, "g"),
      indexInventoryEntries([entry("bag", pilsnerProfile("kursk--pilsner"), 9000, "g")]),
      1
    );
    const yeastMissing = matchLineAgainstInventory(
      { ...line(yeastProfile("fermentis--us-05"), 2, "pack"), id: "line-2", displayOrder: 1 },
      indexInventoryEntries([]),
      1
    );

    const summary = summarizeMatch("r-1", [fermentableCovered, yeastMissing], {
      targetBatchVolumeL: 20,
      recipeBatchVolumeL: 20
    });

    // fermentable weight 5 (covered) + yeast weight 4 (missing) => 5 / 9 ≈ 56%
    expect(summary.matchPercent).toBe(56);
    expect(summary.coveredLines).toBe(1);
    expect(summary.missingCount).toBe(1);
    expect(summary.label).toBe("partial");
    expect(summary.scaledToInventory).toBe(false);
  });
});

describe("computeRecipeMatch — wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads recipe + inventory, scales to the default equipment volume, and matches", async () => {
    (getRecipeById as Mock).mockResolvedValue({
      id: "recipe-1",
      batchSizeNormalizedQuantity: 20000,
      batchSizeNormalizedUnit: "ml",
      ingredients: [
        {
          id: "ri-1",
          persistentKey: "ri-1-pk",
          displayOrder: 0,
          ingredientDisplayName: "Pilsner",
          ingredientDisplayNameSnapshot: "Pilsner",
          ingredientDisplayNameEn: "Pilsner",
          ingredientCategory: "fermentable",
          ingredientSubtype: "malt",
          type: "malt",
          ingredientTechnicalData: { type: "malt", maltType: "base", colorEbcMin: 2, colorEbcMax: 4 },
          ingredientCatalogItemId: "kursk--pilsner",
          userCustomIngredientId: null,
          amountNormalizedQuantity: 5000,
          amountNormalizedUnit: "g"
        }
      ]
    });
    (listInventoryForUser as Mock).mockResolvedValue([
      {
        id: "inv-1",
        normalizedQuantity: 12000,
        normalizedUnit: "g",
        unitDimension: "weight",
        archivedAt: null,
        ingredientCatalogItemId: "soufflet--pilsner",
        userCustomIngredientId: null,
        ingredientCategory: "fermentable",
        ingredientSubtype: "malt",
        ingredientDisplayNameSnapshot: "Pilsner Soufflet",
        source: {
          category: "fermentable",
          type: "malt",
          displayName: "Pilsner",
          nameRu: "Пилснер",
          nameEn: "Pilsner",
          subtype: "malt",
          technicalData: { type: "malt", maltType: "base", colorEbcMin: 3, colorEbcMax: 4 }
        }
      }
    ]);
    (listEquipmentProfiles as Mock).mockResolvedValue([{ targetBatchVolumeL: 40 }]);

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1" });

    expect(result.recipeBatchVolumeL).toBe(20);
    expect(result.targetBatchVolumeL).toBe(40);
    expect(result.scaledToInventory).toBe(true);
    expect(result.lines).toHaveLength(1);
    // 5000g * 2 = 10000g required; 12000g of a different brand pilsner available
    expect(result.lines[0].requiredQuantityNormalized).toBe(10000);
    expect(result.lines[0].status).toBe("substitute");
    expect(result.matchPercent).toBe(100);
  });
});

describe("computeRecipeMatchesForUser — batch", () => {
  const pilsnerInventoryItem = {
    id: "inv-1",
    normalizedQuantity: 12000,
    normalizedUnit: "g",
    unitDimension: "weight",
    archivedAt: null,
    ingredientCatalogItemId: "soufflet--pilsner",
    userCustomIngredientId: null,
    ingredientCategory: "fermentable",
    ingredientSubtype: "malt",
    ingredientDisplayNameSnapshot: "Pilsner Soufflet",
    source: {
      category: "fermentable",
      type: "malt",
      displayName: "Pilsner",
      nameRu: "Пилснер",
      nameEn: "Pilsner",
      subtype: "malt",
      technicalData: { type: "malt", maltType: "base", colorEbcMin: 3, colorEbcMax: 4 }
    }
  };

  const ingredientRow = (overrides: Record<string, unknown>) => ({
    id: "ri-x",
    persistentKey: "ri-x-pk",
    displayOrder: 0,
    ingredientDisplayNameSnapshot: "Pilsner",
    ingredientCategory: "fermentable",
    type: "malt",
    ingredientSubtype: "malt",
    ingredientCatalogItemId: "kursk--pilsner",
    userCustomIngredientId: null,
    amountNormalizedQuantity: 5000,
    amountNormalizedUnit: "g",
    ...overrides
  });

  const recipeRow = (id: string, ingredients: Record<string, unknown>[]) => ({
    id,
    slug: `${id}-slug`,
    title: `Recipe ${id}`,
    batchSizeNormalizedQuantity: 20000,
    batchSizeNormalizedUnit: "ml",
    ingredients
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a match per requested recipe, scaled to the default volume", async () => {
    (listInventoryForUser as Mock).mockResolvedValue([pilsnerInventoryItem]);
    (listEquipmentProfiles as Mock).mockResolvedValue([{ targetBatchVolumeL: 40 }]);
    (db.query.ingredients.findMany as Mock).mockResolvedValue([]);
    (db.query.recipes.findMany as Mock).mockResolvedValue([
      recipeRow("r-1", [ingredientRow({ id: "r1-pils", persistentKey: "r1-pils-pk" })]),
      recipeRow("r-2", [
        ingredientRow({ id: "r2-pils", persistentKey: "r2-pils-pk" }),
        ingredientRow({
          id: "r2-munich",
          persistentKey: "r2-munich-pk",
          displayOrder: 1,
          ingredientDisplayNameSnapshot: "Munich",
          ingredientCatalogItemId: "x--munich",
          amountNormalizedQuantity: 1000
        })
      ])
    ]);

    const result = await computeRecipeMatchesForUser({ userId: "u-1", recipeIds: ["r-1", "r-2"] });

    expect(Object.keys(result).sort()).toEqual(["r-1", "r-2"]);
    // r-1: единственный pilsner покрыт другим брендом (substitute) → ready
    expect(result["r-1"].missingCount).toBe(0);
    expect(result["r-1"].matchPercent).toBe(100);
    expect(result["r-1"].scaledToInventory).toBe(true);
    // r-2: pilsner покрыт, munich отсутствует
    expect(result["r-2"].totalLines).toBe(2);
    expect(result["r-2"].coveredLines).toBe(1);
    expect(result["r-2"].missingCount).toBe(1);
  });

  it("short-circuits to {} on empty inventory without querying recipes", async () => {
    (listInventoryForUser as Mock).mockResolvedValue([]);
    (listEquipmentProfiles as Mock).mockResolvedValue([]);

    const result = await computeRecipeMatchesForUser({ userId: "u-1", recipeIds: ["r-1"] });

    expect(result).toEqual({});
    expect(db.query.recipes.findMany).not.toHaveBeenCalled();
  });

  it("returns {} for empty recipeIds without touching inventory/db", async () => {
    const result = await computeRecipeMatchesForUser({ userId: "u-1", recipeIds: [] });

    expect(result).toEqual({});
    expect(listInventoryForUser).not.toHaveBeenCalled();
    expect(db.query.recipes.findMany).not.toHaveBeenCalled();
  });

  it("omits recipes that are missing or have no ingredients", async () => {
    (listInventoryForUser as Mock).mockResolvedValue([pilsnerInventoryItem]);
    (listEquipmentProfiles as Mock).mockResolvedValue([]);
    (db.query.ingredients.findMany as Mock).mockResolvedValue([]);
    (db.query.recipes.findMany as Mock).mockResolvedValue([
      recipeRow("r-1", [ingredientRow({ id: "r1-pils", persistentKey: "r1-pils-pk" })]),
      recipeRow("r-empty", [])
    ]);

    const result = await computeRecipeMatchesForUser({
      userId: "u-1",
      recipeIds: ["r-1", "r-empty", "r-absent"]
    });

    expect(Object.keys(result)).toEqual(["r-1"]);
  });

  it("includeEmptyInventory: still computes matches (all-missing) instead of short-circuiting to {}", async () => {
    (listInventoryForUser as Mock).mockResolvedValue([]);
    (listEquipmentProfiles as Mock).mockResolvedValue([]);
    (db.query.ingredients.findMany as Mock).mockResolvedValue([]);
    (db.query.recipes.findMany as Mock).mockResolvedValue([
      recipeRow("r-1", [ingredientRow({ id: "r1-pils", persistentKey: "r1-pils-pk" })])
    ]);

    const result = await computeRecipeMatchesForUser({
      userId: "u-1",
      recipeIds: ["r-1"],
      includeEmptyInventory: true
    });

    expect(db.query.recipes.findMany).toHaveBeenCalled();
    expect(result["r-1"].missingCount).toBe(1);
    expect(result["r-1"].matchPercent).toBe(0);
  });

  it("dedupes recipeIds before querying", async () => {
    (listInventoryForUser as Mock).mockResolvedValue([pilsnerInventoryItem]);
    (listEquipmentProfiles as Mock).mockResolvedValue([]);
    (db.query.ingredients.findMany as Mock).mockResolvedValue([]);
    (db.query.recipes.findMany as Mock).mockResolvedValue([
      recipeRow("r-1", [ingredientRow({ id: "r1-pils", persistentKey: "r1-pils-pk" })])
    ]);

    const result = await computeRecipeMatchesForUser({ userId: "u-1", recipeIds: ["r-1", "r-1"] });

    expect(Object.keys(result)).toEqual(["r-1"]);
    // where собирается через inArray(recipes.id, ids) — ids должны быть дедуплицированы
    expect(inArray).toHaveBeenCalledWith(undefined, ["r-1"]);
  });

  it("FIX-3: isolates a per-recipe match failure instead of failing the whole batch", async () => {
    (listInventoryForUser as Mock).mockResolvedValue([pilsnerInventoryItem]);
    (listEquipmentProfiles as Mock).mockResolvedValue([]);
    (db.query.ingredients.findMany as Mock).mockResolvedValue([]);
    (db.query.recipes.findMany as Mock).mockResolvedValue([
      recipeRow("r-1", [ingredientRow({ id: "r1-pils", persistentKey: "r1-pils-pk" })]),
      // amountNormalizedQuantity: -1 подрывает roundTo() внутри matchLineAgainstInventory
      // через мок @nb/brewing-core выше (см. комментарий там) — стенд-ин для
      // повреждённой строки рецепта.
      recipeRow("r-broken", [
        ingredientRow({ id: "rb-pils", persistentKey: "rb-pils-pk", amountNormalizedQuantity: -1 })
      ])
    ]);

    const result = await computeRecipeMatchesForUser({ userId: "u-1", recipeIds: ["r-1", "r-broken"] });

    // Сломанный рецепт пропущен, но не утащил за собой матч r-1.
    expect(Object.keys(result)).toEqual(["r-1"]);
    expect(result["r-1"].missingCount).toBe(0);
  });
});
