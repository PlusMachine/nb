import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";

vi.mock("@nb/db", () => ({
  db: {
    query: {
      recipes: { findMany: vi.fn() },
      ingredients: { findMany: vi.fn() },
      // Объём партии (brew_plan_snapshot.recipe.batchSizeL) — источник масштаба для
      // матча В КОНТЕКСТЕ ПАРТИИ, см. features/recipes/batch-scale.ts.
      brewBatches: { findMany: vi.fn() },
      // Ф6: батч-проверка владения кастомным ингредиентом (resolveOwnedCustomIngredientIds) —
      // where в этом моке игнорируется, тесты задают результат напрямую через mockResolvedValue.
      userCustomIngredients: { findMany: vi.fn() }
    }
  },
  ingredients: {},
  recipeIngredients: {},
  recipes: {},
  brewBatches: {},
  userCustomIngredients: {},
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn()
}));
vi.mock("../features/recipes/service", () => ({ getRecipeById: vi.fn() }));
vi.mock("../features/inventory/service", () => ({ listInventoryForUser: vi.fn() }));
vi.mock("../features/equipment-profiles/service", () => ({ listEquipmentProfiles: vi.fn() }));
// Кредит партии (уже списанное под эту варку) — источник данных подменяем, чтобы
// проверить именно арифметику матча. Сквозной путь «аллокации в БД → кредит →
// матч» покрыт на живом @nb/db-моке в coverage-recipe-match-journeys.test.ts.
vi.mock("../features/inventory/brew-batch-credits", () => ({
  getBrewBatchInventoryCredits: vi.fn(),
  getBrewBatchInventoryCreditsForBatches: vi.fn()
}));
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
  computeRecipeMatchesForBrewBatches,
  computeRecipeMatchesForUser,
  findSubstituteCandidatesForLine,
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
import {
  getBrewBatchInventoryCredits,
  getBrewBatchInventoryCreditsForBatches,
  type InventoryCreditMap
} from "../features/inventory/brew-batch-credits";

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
  normalizedUnit,
  technicalData: profile.technicalData ?? null
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

// Ф2: подбор ЗАМЕН на списании (features/brew-batches/inventory.ts, предпросмотр).
describe("findSubstituteCandidatesForLine — Ф2 замены на списании", () => {
  const hopProfile = (catalogItemId: string, alphaAcidPctTypical: number, name = "Cascade"): IngredientMatchProfile => ({
    category: "hop",
    type: "hop",
    name,
    nameEn: name,
    technicalData: { type: "hop", alphaAcidPctTypical },
    catalogItemId,
    dimension: "weight"
  });

  it("finds a different-brand product of the same fermentable group", () => {
    const index = indexInventoryEntries([
      entry("bag-soufflet", pilsnerProfile("soufflet--pilsner"), 5000, "g")
    ]);

    const candidates = findSubstituteCandidatesForLine(pilsnerProfile("kursk--pilsner"), "g", index);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.itemId).toBe("bag-soufflet");
  });

  it("returns no substitutes for yeast (exact_only, presence-based)", () => {
    const index = indexInventoryEntries([
      entry("y-1", yeastProfile("lallemand--us-05-clone"), 5, "pack")
    ]);

    const candidates = findSubstituteCandidatesForLine(yeastProfile("fermentis--us-05"), "pack", index);

    expect(candidates).toEqual([]);
  });

  it("excludes an incompatible dimension (count on shelf, weight required)", () => {
    const index = indexInventoryEntries([
      entry("c-1", { ...pilsnerProfile("soufflet--pilsner"), dimension: "count" }, 5, "pack")
    ]);

    const candidates = findSubstituteCandidatesForLine(pilsnerProfile("kursk--pilsner"), "g", index);

    expect(candidates).toEqual([]);
  });

  it("does not offer the exact same product as its own substitute", () => {
    const index = indexInventoryEntries([
      entry("bag-kursk", pilsnerProfile("kursk--pilsner"), 5000, "g")
    ]);

    const candidates = findSubstituteCandidatesForLine(pilsnerProfile("kursk--pilsner"), "g", index);

    expect(candidates).toEqual([]);
  });

  it("sorts candidates by closeness of the numeric characteristic (EBC), then by larger remaining stock", () => {
    const line12Ebc = { ...pilsnerProfile("kursk--pilsner"), technicalData: { type: "malt" as const, maltType: "base", colorEbcMin: 3, colorEbcMax: 3 } };
    const index = indexInventoryEntries([
      entry("far", { ...pilsnerProfile("brand-far--pilsner"), technicalData: { type: "malt", maltType: "base", colorEbcMin: 20, colorEbcMax: 20 } }, 9000, "g"),
      entry("close-small", { ...pilsnerProfile("brand-close--pilsner"), technicalData: { type: "malt", maltType: "base", colorEbcMin: 4, colorEbcMax: 4 } }, 1000, "g"),
      entry("close-big", { ...pilsnerProfile("brand-close2--pilsner"), technicalData: { type: "malt", maltType: "base", colorEbcMin: 4, colorEbcMax: 4 } }, 5000, "g"),
      entry("no-data", { ...pilsnerProfile("brand-nodata--pilsner"), technicalData: null }, 3000, "g")
    ]);

    const candidates = findSubstituteCandidatesForLine(line12Ebc, "g", index);

    // ближе по EBC (одинаковая дистанция у close-small/close-big) — больший остаток
    // раньше; без данных — в конец, дальше по EBC "far" — перед ним.
    expect(candidates.map((candidate) => candidate.itemId)).toEqual(["close-big", "close-small", "far", "no-data"]);
  });

  it("sorts hop candidates by closeness of alpha acid", () => {
    const lineHop = hopProfile("cascade--kursk", 6);
    const index = indexInventoryEntries([
      entry("high-alpha", hopProfile("cascade--brand-a", 12), 500, "g"),
      entry("close-alpha", hopProfile("cascade--brand-b", 6.5), 500, "g")
    ]);

    const candidates = findSubstituteCandidatesForLine(lineHop, "g", index);

    expect(candidates.map((candidate) => candidate.itemId)).toEqual(["close-alpha", "high-alpha"]);
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

// Ф6 (P0): userCustomIngredientId в строке рецепта — сырой FK кастомного
// ингредиента АВТОРА рецепта, а не обязательно смотрящего (computeRecipeMatch
// вызывается и для просмотра ЧУЖОГО рецепта). Утечка чужого id ломает инлайн-
// форму «На склад» (шлёт чужой FK в addRecipeIngredientToInventory) — гейт
// владения обязан подменять его на null ДО того, как DTO уйдёт наружу.
describe("computeRecipeMatch — Ф6: гейт владения кастомным ингредиентом строки", () => {
  const recipeWithCustomLine = () => ({
    id: "recipe-1",
    batchSizeNormalizedQuantity: 20000,
    batchSizeNormalizedUnit: "ml",
    ingredients: [
      {
        id: "ri-1",
        persistentKey: "ri-1-pk",
        displayOrder: 0,
        ingredientDisplayName: "Особый солод автора",
        ingredientDisplayNameSnapshot: "Особый солод автора",
        ingredientDisplayNameEn: null,
        ingredientCategory: "fermentable",
        ingredientSubtype: "malt",
        type: "malt",
        ingredientTechnicalData: { type: "malt", maltType: "base", colorEbcMin: 2, colorEbcMax: 4 },
        ingredientCatalogItemId: null,
        userCustomIngredientId: "author-custom-1",
        amountNormalizedQuantity: 5000,
        amountNormalizedUnit: "g"
      }
    ]
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (listInventoryForUser as Mock).mockResolvedValue([]);
    (listEquipmentProfiles as Mock).mockResolvedValue([]);
  });

  it("зритель НЕ владеет кастомным ингредиентом автора → userCustomIngredientId в DTO становится null (name-only путь)", async () => {
    (getRecipeById as Mock).mockResolvedValue(recipeWithCustomLine());
    // Батч-проверка владения: этот customId зрителю не принадлежит.
    (db.query.userCustomIngredients.findMany as Mock).mockResolvedValue([]);

    const result = await computeRecipeMatch({ userId: "viewer-1", recipeId: "recipe-1" });

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].userCustomIngredientId).toBeNull();
    expect(result.lines[0].ingredientCatalogItemId).toBeNull();
    // Батч-проверка ушла ровно за customId строки и ровно за смотрящим.
    expect(db.query.userCustomIngredients.findMany).toHaveBeenCalledTimes(1);
  });

  it("автор рецепта смотрит свой же рецепт → владение подтверждено, id сохраняется", async () => {
    (getRecipeById as Mock).mockResolvedValue(recipeWithCustomLine());
    // Батч-проверка владения: customId принадлежит смотрящему (он же автор).
    (db.query.userCustomIngredients.findMany as Mock).mockResolvedValue([{ id: "author-custom-1" }]);

    const result = await computeRecipeMatch({ userId: "author-1", recipeId: "recipe-1" });

    expect(result.lines[0].userCustomIngredientId).toBe("author-custom-1");
  });

  it("в рецепте нет кастомных строк → батч-проверка владения не запрашивается вовсе", async () => {
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

    const result = await computeRecipeMatch({ userId: "viewer-1", recipeId: "recipe-1" });

    expect(result.lines[0].userCustomIngredientId).toBeNull();
    expect(db.query.userCustomIngredients.findMany).not.toHaveBeenCalled();
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

  // Ф6: этот путь обслуживает и §3.3 списка покупок (чужие избранные рецепты) —
  // customId строки принадлежит автору рецепта, не смотрящему батч.
  it("Ф6: чужой рецепт с кастомной строкой в батче → userCustomIngredientId нулится по гейту владения", async () => {
    (listInventoryForUser as Mock).mockResolvedValue([]);
    (listEquipmentProfiles as Mock).mockResolvedValue([]);
    (db.query.ingredients.findMany as Mock).mockResolvedValue([]);
    (db.query.recipes.findMany as Mock).mockResolvedValue([
      recipeRow("r-foreign", [
        ingredientRow({
          id: "rf-custom",
          persistentKey: "rf-custom-pk",
          ingredientCatalogItemId: null,
          userCustomIngredientId: "author-custom-9"
        })
      ])
    ]);
    // Смотрящий не владеет этим кастомным ингредиентом.
    (db.query.userCustomIngredients.findMany as Mock).mockResolvedValue([]);

    const result = await computeRecipeMatchesForUser({
      userId: "viewer-1",
      recipeIds: ["r-foreign"],
      // Пустой склад иначе даёт короткий выход в {} до похода за рецептами —
      // см. комментарий у includeEmptyInventory; тест целится строго в гейт.
      includeEmptyInventory: true
    });

    expect(result["r-foreign"].lines[0].userCustomIngredientId).toBeNull();
    expect(result["r-foreign"].lines[0].ingredientCatalogItemId).toBeNull();
  });
});

// --- кредит партии: списанное под варку не должно считаться нехваткой -------

// Кейс из живого прогона (dev-БД, партия «Летний пилснер»): рецепт требует 4000 г
// пильзнера, партия их уже списала, на складе остался 1000 г. Матч по остатку
// показывал «не хватает 3 кг» — той самой партии, которая этот солод и забрала.
const pilsnerRecipe = (required = 4000) => ({
  id: "recipe-1",
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  ingredients: [
    {
      id: "ri-1",
      persistentKey: "ri-1-pk",
      displayOrder: 0,
      ingredientDisplayName: "Пильзнер",
      ingredientDisplayNameSnapshot: "Пильзнер",
      ingredientDisplayNameEn: "Pilsner",
      ingredientCategory: "fermentable",
      ingredientSubtype: "malt",
      type: "malt",
      ingredientTechnicalData: { type: "malt", maltType: "base", colorEbcMin: 2, colorEbcMax: 4 },
      ingredientCatalogItemId: "kursk--pilsner",
      userCustomIngredientId: null,
      amountNormalizedQuantity: required,
      amountNormalizedUnit: "g"
    }
  ]
});

const pilsnerStock = (normalizedQuantity: number) => ({
  id: "inv-pils",
  normalizedQuantity,
  normalizedUnit: "g",
  unitDimension: "weight",
  archivedAt: null,
  ingredientCatalogItemId: "kursk--pilsner",
  userCustomIngredientId: null,
  ingredientCategory: "fermentable",
  ingredientSubtype: "malt",
  ingredientDisplayNameSnapshot: "Пильзнер",
  source: {
    category: "fermentable",
    type: "malt",
    displayName: "Пильзнер",
    nameRu: "Пильзнер",
    nameEn: "Pilsner",
    subtype: "malt",
    technicalData: { type: "malt", maltType: "base", colorEbcMin: 2, colorEbcMax: 4 }
  }
});

const credit = (quantityNormalized: number, normalizedUnit = "g"): InventoryCreditMap =>
  new Map([["inv-pils", { quantityNormalized, normalizedUnit }]]);

describe("computeRecipeMatch — кредит партии (уже списанное под эту варку)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listEquipmentProfiles as Mock).mockResolvedValue([]);
    (db.query.brewBatches.findMany as Mock).mockResolvedValue([]);
    (getBrewBatchInventoryCredits as Mock).mockResolvedValue(new Map());
  });

  it("списание под партию не порождает нехватку у неё же: с brewBatchId строка covered", async () => {
    (getRecipeById as Mock).mockResolvedValue(pilsnerRecipe(4000));
    (listInventoryForUser as Mock).mockResolvedValue([pilsnerStock(1000)]);
    (getBrewBatchInventoryCredits as Mock).mockResolvedValue(credit(4000));

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1", brewBatchId: "bb-1" });

    expect(result.lines[0].status).toBe("covered");
    expect(result.lines[0].availableQuantityNormalized).toBe(5000);
    expect(result.lines[0].shortfallNormalized).toBe(0);
    expect(result.lines[0].suggestedAddQuantity).toBeNull();
    expect(result.matchPercent).toBe(100);
  });

  it("тот же склад БЕЗ brewBatchId — прежнее поведение (partial, нехватка 3000 г)", async () => {
    (getRecipeById as Mock).mockResolvedValue(pilsnerRecipe(4000));
    (listInventoryForUser as Mock).mockResolvedValue([pilsnerStock(1000)]);
    (getBrewBatchInventoryCredits as Mock).mockResolvedValue(credit(4000));

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1" });

    expect(result.lines[0].status).toBe("partial");
    expect(result.lines[0].availableQuantityNormalized).toBe(1000);
    expect(result.lines[0].shortfallNormalized).toBe(3000);
    // Кредит без партии даже не запрашивается: витрина/дашборд/страница стиля
    // обязаны видеть фактический склад.
    expect(getBrewBatchInventoryCredits).not.toHaveBeenCalled();
  });

  it("позиция, списанная В НОЛЬ, не выпадает из индекса: covered, а не missing", async () => {
    (getRecipeById as Mock).mockResolvedValue(pilsnerRecipe(4000));
    (listInventoryForUser as Mock).mockResolvedValue([pilsnerStock(0)]);
    (getBrewBatchInventoryCredits as Mock).mockResolvedValue(credit(4000));

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1", brewBatchId: "bb-1" });

    // Регресс на порядок операций: кредит обязан прибавляться ДО отсечки «>0»,
    // иначе обнулённая позиция выбрасывается из индекса и строка становится
    // "missing" — хуже, чем исходный "partial".
    expect(result.lines[0].status).toBe("covered");
    expect(result.lines[0].availableQuantityNormalized).toBe(4000);
  });

  it("склад запрашивается с includeEmpty: обнулённая позиция обязана дойти до кредита", async () => {
    (getRecipeById as Mock).mockResolvedValue(pilsnerRecipe(4000));
    (listInventoryForUser as Mock).mockResolvedValue([pilsnerStock(0)]);
    (getBrewBatchInventoryCredits as Mock).mockResolvedValue(credit(4000));

    await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1", brewBatchId: "bb-1" });

    // Живой listInventoryForUser по умолчанию ВЫБРАСЫВАЕТ позиции с нулевым
    // остатком — тогда кредит списанной в ноль позиции применять не к чему, и
    // партия сама себе показывает «не хватает» сразу после списания.
    // Мок этого не воспроизводит, поэтому фиксируем сам контракт вызова.
    expect(listInventoryForUser).toHaveBeenCalledWith("u-1", { includeEmpty: true });
  });

  it("кредит в чужой единице игнорируется (позицию пересоздали в других единицах)", async () => {
    (getRecipeById as Mock).mockResolvedValue(pilsnerRecipe(4000));
    (listInventoryForUser as Mock).mockResolvedValue([pilsnerStock(1000)]);
    (getBrewBatchInventoryCredits as Mock).mockResolvedValue(credit(4000, "pack"));

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1", brewBatchId: "bb-1" });

    expect(result.lines[0].status).toBe("partial");
    expect(result.lines[0].availableQuantityNormalized).toBe(1000);
    expect(result.lines[0].shortfallNormalized).toBe(3000);
  });

  it("кредит запрашивается ровно у своей партии", async () => {
    (getRecipeById as Mock).mockResolvedValue(pilsnerRecipe(4000));
    (listInventoryForUser as Mock).mockResolvedValue([pilsnerStock(1000)]);

    await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1", brewBatchId: "bb-1" });

    expect(getBrewBatchInventoryCredits).toHaveBeenCalledTimes(1);
    expect(getBrewBatchInventoryCredits).toHaveBeenCalledWith("u-1", "bb-1");
  });
});

// H1: матч масштабировал потребность под дефолтный профиль оборудования, а списание
// брало количества рецепта как есть. Рецепт на 30 л при профиле «BIAB 20 л» давал на
// странице партии «Хватает всего» (нужно 4.98 кг при остатке 5 кг) и одновременно
// INSUFFICIENT_STOCK по кнопке «Списать» (требовались полные 7.467 кг).
// Для партии источник объёма один — её план (brew_plan_snapshot.recipe.batchSizeL).
describe("computeRecipeMatch — объём ПАРТИИ, а не дефолтный профиль оборудования", () => {
  const batchRow = (batchSizeL: number | null) => ({
    id: "bb-1",
    brewPlanSnapshot: { recipe: { batchSizeL } }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (getBrewBatchInventoryCredits as Mock).mockResolvedValue(new Map());
    (getRecipeById as Mock).mockResolvedValue(pilsnerRecipe(4000));
    (listInventoryForUser as Mock).mockResolvedValue([pilsnerStock(5000)]);
    // Дефолтный профиль вдвое меньше рецепта: до фикса он ужимал потребность
    // партии до 2000 г, и матч «не видел» нехватки, которую находило списание.
    (listEquipmentProfiles as Mock).mockResolvedValue([{ targetBatchVolumeL: 10 }]);
  });

  it("партия на 40 л по рецепту 20 л: потребность удваивается, профиль игнорируется", async () => {
    (db.query.brewBatches.findMany as Mock).mockResolvedValue([batchRow(40)]);

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1", brewBatchId: "bb-1" });

    expect(result.targetBatchVolumeL).toBe(40);
    expect(result.lines[0].requiredQuantityNormalized).toBe(8000);
    expect(result.lines[0].status).toBe("partial");
    expect(result.lines[0].shortfallNormalized).toBe(3000);
    // Профиль оборудования для партии даже не запрашивается.
    expect(listEquipmentProfiles).not.toHaveBeenCalled();
  });

  it("план партии без объёма → потребность рецепта как есть (тот же множитель, что у списания)", async () => {
    (db.query.brewBatches.findMany as Mock).mockResolvedValue([batchRow(null)]);

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1", brewBatchId: "bb-1" });

    expect(result.targetBatchVolumeL).toBe(20);
    expect(result.lines[0].requiredQuantityNormalized).toBe(4000);
    expect(result.lines[0].status).toBe("covered");
    expect(listEquipmentProfiles).not.toHaveBeenCalled();
  });

  it("объём партии читается ровно у своей партии и своего пользователя", async () => {
    (db.query.brewBatches.findMany as Mock).mockResolvedValue([batchRow(40)]);

    await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1", brewBatchId: "bb-1" });

    expect(db.query.brewBatches.findMany).toHaveBeenCalledTimes(1);
  });

  it("вне партии дефолтный профиль по-прежнему масштабирует (витрина/дашборд)", async () => {
    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1" });

    expect(result.targetBatchVolumeL).toBe(10);
    expect(result.lines[0].requiredQuantityNormalized).toBe(2000);
    expect(db.query.brewBatches.findMany).not.toHaveBeenCalled();
  });

  it("явный targetBatchVolumeL бьёт объём партии (пересчёт «а если сварю столько»)", async () => {
    (db.query.brewBatches.findMany as Mock).mockResolvedValue([batchRow(40)]);

    const result = await computeRecipeMatch({
      userId: "u-1",
      recipeId: "recipe-1",
      brewBatchId: "bb-1",
      targetBatchVolumeL: 30
    });

    expect(result.targetBatchVolumeL).toBe(30);
    expect(result.lines[0].requiredQuantityNormalized).toBe(6000);
    // За партией всё же ходим: даже при явном объёме дожим засыпи берётся из её
    // плана (варится-то она на своей эффективности). Объём при этом — явный.
    expect(db.query.brewBatches.findMany).toHaveBeenCalledTimes(1);
  });
});

// --- дожим засыпи под эффективность --------------------------------------
//
// Варка на своём оборудовании идёт и на своей эффективности: чтобы попасть в
// авторский OG, солода нужно больше (75/65 = ×1.154). Матч ОБЯЗАН считать
// потребность тем же множителем, что списание, — иначе карточка снова обещает
// «хватает», а склад не сходится.

describe("computeRecipeMatch — эффективность оборудования дожимает засыпь", () => {
  const batchRow = (batchSizeL: number | null, efficiencyPct?: number, recipeEfficiencyPct?: number) => ({
    id: "bb-1",
    brewPlanSnapshot: { recipe: { batchSizeL, efficiencyPct, recipeEfficiencyPct } }
  });

  const recipeAt75 = () => ({ ...pilsnerRecipe(4000), efficiency: 75 });

  beforeEach(() => {
    vi.clearAllMocks();
    (getBrewBatchInventoryCredits as Mock).mockResolvedValue(new Map());
    (getRecipeById as Mock).mockResolvedValue(recipeAt75());
    (listInventoryForUser as Mock).mockResolvedValue([pilsnerStock(5000)]);
  });

  it("вне партии: дефолтный профиль на 65% против рецепта на 75% → солода нужно ×1.154", async () => {
    (listEquipmentProfiles as Mock).mockResolvedValue([
      { targetBatchVolumeL: 20, brewhouseEfficiencyPct: 65 }
    ]);

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1" });

    // Объём тот же (20 л), но эффективность ниже: 4000 г × 75/65 = 4615.385 г.
    expect(result.targetBatchVolumeL).toBe(20);
    expect(result.lines[0].requiredQuantityNormalized).toBeCloseTo(4615.385, 2);
  });

  it("эффективность профиля совпала с авторской → дожима нет", async () => {
    (listEquipmentProfiles as Mock).mockResolvedValue([
      { targetBatchVolumeL: 20, brewhouseEfficiencyPct: 75 }
    ]);

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1" });

    expect(result.lines[0].requiredQuantityNormalized).toBe(4000);
  });

  it("у ПАРТИИ дожим берётся из её плана, а не из текущего профиля пользователя", async () => {
    // Профиль с тех пор поменяли на 50% — партию это трогать не должно: она варится
    // по тому, что зафиксировано на старте (65%).
    (listEquipmentProfiles as Mock).mockResolvedValue([
      { targetBatchVolumeL: 5, brewhouseEfficiencyPct: 50 }
    ]);
    (db.query.brewBatches.findMany as Mock).mockResolvedValue([batchRow(20, 65, 75)]);

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1", brewBatchId: "bb-1" });

    expect(result.targetBatchVolumeL).toBe(20);
    expect(result.lines[0].requiredQuantityNormalized).toBeCloseTo(4615.385, 2);
    expect(listEquipmentProfiles).not.toHaveBeenCalled();
  });

  it("старая партия без эффективностей в плане → дожима нет (прежнее поведение)", async () => {
    (listEquipmentProfiles as Mock).mockResolvedValue([]);
    (db.query.brewBatches.findMany as Mock).mockResolvedValue([batchRow(20)]);

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1", brewBatchId: "bb-1" });

    expect(result.lines[0].requiredQuantityNormalized).toBe(4000);
  });
});

describe("computeRecipeMatchesForBrewBatches — ключ по партии, а не по рецепту", () => {
  const pilsnerRow = {
    id: "ri-1",
    persistentKey: "ri-1-pk",
    displayOrder: 0,
    ingredientDisplayNameSnapshot: "Пильзнер",
    ingredientCategory: "fermentable",
    type: "malt",
    ingredientSubtype: "malt",
    ingredientCatalogItemId: "kursk--pilsner",
    userCustomIngredientId: null,
    amountNormalizedQuantity: 4000,
    amountNormalizedUnit: "g"
  };

  const recipeRow = {
    id: "r-1",
    slug: "r-1-slug",
    title: "Летний пилснер",
    batchSizeNormalizedQuantity: 20000,
    batchSizeNormalizedUnit: "ml",
    ingredients: [pilsnerRow]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (listEquipmentProfiles as Mock).mockResolvedValue([]);
    (db.query.ingredients.findMany as Mock).mockResolvedValue([]);
    (db.query.recipes.findMany as Mock).mockResolvedValue([recipeRow]);
    (db.query.brewBatches.findMany as Mock).mockResolvedValue([]);
    (getBrewBatchInventoryCreditsForBatches as Mock).mockResolvedValue(new Map());
  });

  it("две партии на ОДИН рецепт: кредит списавшейся не занижает нехватку второй", async () => {
    (listInventoryForUser as Mock).mockResolvedValue([pilsnerStock(1000)]);
    (getBrewBatchInventoryCreditsForBatches as Mock).mockResolvedValue(
      new Map([["bb-1", credit(4000)]])
    );

    const result = await computeRecipeMatchesForBrewBatches({
      userId: "u-1",
      batches: [
        { brewBatchId: "bb-1", recipeId: "r-1" },
        { brewBatchId: "bb-2", recipeId: "r-1" }
      ]
    });

    // bb-1 уже списала свои 4000 г — ей хватает.
    expect(result["bb-1"].lines[0].status).toBe("covered");
    expect(result["bb-1"].lines[0].shortfallNormalized).toBe(0);
    // bb-2 ничего не списывала: её нехватка считается по РЕАЛЬНОМУ остатку.
    // Если бы результат ключевался рецептом, кредит bb-1 стёр бы эту нехватку.
    expect(result["bb-2"].lines[0].status).toBe("partial");
    expect(result["bb-2"].lines[0].shortfallNormalized).toBe(3000);
  });

  it("склад запрашивается с includeEmpty: списанная в ноль позиция должна дойти до кредита", async () => {
    (listInventoryForUser as Mock).mockResolvedValue([pilsnerStock(0)]);
    (getBrewBatchInventoryCreditsForBatches as Mock).mockResolvedValue(
      new Map([["bb-1", credit(4000)]])
    );

    const result = await computeRecipeMatchesForBrewBatches({
      userId: "u-1",
      batches: [{ brewBatchId: "bb-1", recipeId: "r-1" }]
    });

    expect(listInventoryForUser).toHaveBeenCalledWith("u-1", { includeEmpty: true });
    expect(result["bb-1"].lines[0].status).toBe("covered");
  });

  it("партия без кредита считается по фактическому складу", async () => {
    (listInventoryForUser as Mock).mockResolvedValue([pilsnerStock(1000)]);

    const result = await computeRecipeMatchesForBrewBatches({
      userId: "u-1",
      batches: [{ brewBatchId: "bb-2", recipeId: "r-1" }]
    });

    expect(Object.keys(result)).toEqual(["bb-2"]);
    expect(result["bb-2"].recipeId).toBe("r-1");
    expect(result["bb-2"].lines[0].shortfallNormalized).toBe(3000);
  });

  it("пустой склад не приводит к короткому выходу: строки нужны списку покупок", async () => {
    (listInventoryForUser as Mock).mockResolvedValue([]);

    const result = await computeRecipeMatchesForBrewBatches({
      userId: "u-1",
      batches: [{ brewBatchId: "bb-1", recipeId: "r-1" }]
    });

    expect(db.query.recipes.findMany).toHaveBeenCalled();
    expect(result["bb-1"].missingCount).toBe(1);
    expect(result["bb-1"].matchPercent).toBe(0);
  });

  it("пустой список партий → {} без походов в БД", async () => {
    const result = await computeRecipeMatchesForBrewBatches({ userId: "u-1", batches: [] });

    expect(result).toEqual({});
    expect(listInventoryForUser).not.toHaveBeenCalled();
    expect(db.query.recipes.findMany).not.toHaveBeenCalled();
  });

  // H1 на списке партий и в /app/shopping: у каждой партии свой объём, а не общий
  // дефолтный профиль — список покупок обязан требовать ровно то, что снимет со
  // склада кнопка «Списать» на странице этой партии.
  it("две партии одного рецепта с РАЗНЫМ объёмом: потребность у каждой своя", async () => {
    (listInventoryForUser as Mock).mockResolvedValue([pilsnerStock(0)]);
    (listEquipmentProfiles as Mock).mockResolvedValue([{ targetBatchVolumeL: 10 }]);
    (db.query.brewBatches.findMany as Mock).mockResolvedValue([
      { id: "bb-1", brewPlanSnapshot: { recipe: { batchSizeL: 20 } } },
      { id: "bb-2", brewPlanSnapshot: { recipe: { batchSizeL: 40 } } }
    ]);

    const result = await computeRecipeMatchesForBrewBatches({
      userId: "u-1",
      batches: [
        { brewBatchId: "bb-1", recipeId: "r-1" },
        { brewBatchId: "bb-2", recipeId: "r-1" }
      ]
    });

    expect(result["bb-1"].targetBatchVolumeL).toBe(20);
    expect(result["bb-1"].lines[0].requiredQuantityNormalized).toBe(4000);
    expect(result["bb-2"].targetBatchVolumeL).toBe(40);
    expect(result["bb-2"].lines[0].requiredQuantityNormalized).toBe(8000);
    // Профиль оборудования на пути партий не при чём.
    expect(listEquipmentProfiles).not.toHaveBeenCalled();
  });
});
