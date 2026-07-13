import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// Покрытие сквозных сценариев подбора рецептов под склад (recipe match /
// brewability). Сервис-слой тестируется БЕЗ реальной БД: @nb/db мокается
// in-memory через vi.hoisted + vi.mock, верхнеуровневые сервисы (рецепт/склад/
// оборудование) — отдельными vi.mock. Чистые функции движка (indexInventoryEntries,
// matchLineAgainstInventory, summarizeMatch) гоняем напрямую.
//
// Сознательно НЕ дублируем уже покрытое в recipe-match-service.test.ts и
// recipe-inventory-service.test.ts — целимся в непокрытые ветки: объём/штучные
// конверсии в матче, частичная замена, кастом vs каталог, пороги label/brewable,
// обратный матчинг склад→рецепты (findBrewable*), сквозной computeRecipeMatch на
// пустом складе и multi-line рецепте, чистая конверсия нормализованных количеств.

const { mockState } = vi.hoisted(() => ({
  mockState: {
    recipes: [] as any[],
    lines: [] as any[],
    allocations: [] as any[],
    inventory: [] as any[],
    // Партии: матч в контексте партии берёт объём отсюда (brew_plan_snapshot),
    // а не из дефолтного профиля оборудования — см. features/recipes/batch-scale.ts.
    brewBatches: [] as any[]
  }
}));

vi.mock("server-only", () => ({}));

// Единый мок @nb/db, обслуживающий обе подсистемы:
//  - match-service: db.query.recipes.findMany / db.query.ingredients.findMany — vi.fn
//    (where игнорируется, данные задаём mockResolvedValue);
//  - inventory-service (listRecipeStockCoverage): db.query.* как читалки in-memory
//    состояния с разбором eq()/inArray()-фильтров (как в reference-харнессе).
vi.mock("@nb/db", () => {
  const getEqValue = (where: any, key: string) => {
    const items = Array.isArray(where) ? where.flat(8) : [where];
    const index = items.findIndex((item) => item === key);
    return index >= 0 ? items[index + 1] : undefined;
  };
  const getInArrayValue = (where: any, key: string): string[] | undefined => {
    if (!Array.isArray(where)) {
      return undefined;
    }
    if (where[0] === `in:${key}` && Array.isArray(where[1])) {
      return where[1] as string[];
    }
    for (const item of where) {
      const nested = getInArrayValue(item, key);
      if (nested) {
        return nested;
      }
    }
    return undefined;
  };

  const db: any = {
    query: {
      recipes: {
        findMany: vi.fn(),
        findFirst: async (arg: any) => {
          const id = getEqValue(arg?.where, "id");
          const authorId = getEqValue(arg?.where, "authorId");
          return mockState.recipes.find(
            (recipe) => recipe.id === id && (authorId == null || recipe.authorId === authorId)
          ) ?? null;
        }
      },
      ingredients: { findMany: vi.fn() },
      recipeIngredients: {
        findMany: async (arg: any) => {
          const recipeId = getEqValue(arg?.where, "recipeId");
          return mockState.lines.filter((line) => line.recipeId === recipeId);
        }
      },
      recipeInventoryAllocations: {
        // Два потребителя с разными фильтрами: listRecipeStockCoverage читает по
        // (userId, recipeId, status ∈ [...]), кредиты партии (brew-batch-credits) —
        // по (userId, brewBatchId ∈ [...], status = 'consumed'). Каждое условие
        // применяем, только если оно реально пришло в where.
        findMany: async (arg: any) => {
          const userId = getEqValue(arg?.where, "userId");
          const recipeId = getEqValue(arg?.where, "recipeId");
          const status = getEqValue(arg?.where, "status");
          const statuses = getInArrayValue(arg?.where, "status");
          const brewBatchIds = getInArrayValue(arg?.where, "brewBatchId");
          return mockState.allocations.filter((allocation) => (
            allocation.userId === userId
            && (recipeId === undefined || allocation.recipeId === recipeId)
            && (status === undefined || allocation.status === status)
            && (!statuses || statuses.includes(allocation.status))
            && (!brewBatchIds || brewBatchIds.includes(allocation.brewBatchId))
          ));
        }
      },
      userIngredients: {
        findMany: async (arg: any) => {
          const userId = getEqValue(arg?.where, "userId");
          const ids = getInArrayValue(arg?.where, "id");
          return mockState.inventory.filter((item) => (
            item.userId === userId && (!ids || ids.includes(item.id))
          ));
        },
        findFirst: async (arg: any) => {
          const id = getEqValue(arg?.where, "id");
          const userId = getEqValue(arg?.where, "userId");
          return mockState.inventory.find((item) => item.id === id && item.userId === userId) ?? null;
        }
      },
      brewBatches: {
        findMany: async (arg: any) => {
          const userId = getEqValue(arg?.where, "userId");
          const ids = getInArrayValue(arg?.where, "id");
          return mockState.brewBatches.filter((batch) => (
            batch.userId === userId && (!ids || ids.includes(batch.id))
          ));
        }
      }
    }
  };

  return {
    db,
    and: (...args: unknown[]) => args,
    eq: (...args: unknown[]) => args,
    inArray: (column: string, values: string[]) => [`in:${column}`, values],
    isNull: (...args: unknown[]) => args,
    ingredients: { id: "id" },
    inventoryTransactions: { name: "inventory_transactions" },
    recipeIngredients: { recipeId: "recipeId", persistentKey: "persistentKey", id: "id" },
    recipeInventoryAllocations: {
      userId: "userId",
      recipeId: "recipeId",
      recipeIngredientId: "recipeIngredientId",
      brewBatchId: "brewBatchId",
      status: "status",
      id: "id"
    },
    recipes: { id: "id", authorId: "authorId", publicationState: "publicationState" },
    userIngredients: {
      id: "id",
      userId: "userId",
      ingredientCatalogItemId: "ingredientCatalogItemId",
      userCustomIngredientId: "userCustomIngredientId"
    },
    brewBatches: { id: "id", userId: "userId" }
  };
});

vi.mock("../features/recipes/service", () => ({ getRecipeById: vi.fn() }));
vi.mock("../features/inventory/service", () => ({ listInventoryForUser: vi.fn() }));
vi.mock("../features/equipment-profiles/service", () => ({ listEquipmentProfiles: vi.fn() }));

import {
  computeRecipeMatch,
  findBrewableOwnRecipesForUser,
  findBrewableRecipesForUser,
  indexInventoryEntries,
  matchLineAgainstInventory,
  summarizeMatch,
  type InventoryMatchEntry,
  type MatchLineInput
} from "../features/recipes/match-service";
import { convertNormalizedQuantityToEnteredUnit, listRecipeStockCoverage } from "../features/recipes/inventory-service";
import { resolveIngredientMatchKey, type IngredientMatchProfile } from "../features/ingredients/match-group";
import type { RecipeMatchLineDto } from "../features/recipes/contracts";
import { db } from "@nb/db";
import { getRecipeById } from "../features/recipes/service";
import { listInventoryForUser } from "../features/inventory/service";
import { listEquipmentProfiles } from "../features/equipment-profiles/service";

// --- профили ингредиентов для движка матча ---------------------------------

const pilsner = (id: string, kind: "catalog" | "custom" = "catalog"): IngredientMatchProfile => ({
  category: "fermentable",
  type: "malt",
  name: "Pilsner",
  nameEn: "Pilsner",
  technicalData: { type: "malt", maltType: "base", colorEbcMin: 2, colorEbcMax: 4 },
  catalogItemId: kind === "catalog" ? id : null,
  customId: kind === "custom" ? id : null,
  dimension: "weight"
});

const lacticAcid = (id: string): IngredientMatchProfile => ({
  category: "water_treatment",
  type: "water_treatment",
  name: "Молочная кислота",
  nameEn: "Lactic acid",
  subtype: "acid",
  technicalData: { type: "water_treatment", formula: "C3H6O3" },
  catalogItemId: id,
  dimension: "volume"
});

const whirlflocTablet = (id: string): IngredientMatchProfile => ({
  category: "consumable",
  type: "consumable",
  name: "Whirlfloc",
  nameEn: "Whirlfloc",
  subtype: "fining",
  catalogItemId: id,
  dimension: "count"
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
  normalizedUnit: MatchLineInput["normalizedUnit"],
  id = "line-1"
): MatchLineInput => ({
  id,
  persistentKey: `${id}-pk`,
  displayOrder: 0,
  displayName: profile.name ?? null,
  profile,
  requiredNormalizedQuantity: required,
  normalizedUnit
});

describe("matchLineAgainstInventory — конверсии по измерениям (объём/штуки)", () => {
  it("сводит объём к мл и покрывает строку из большего запаса (л↔мл нормализованы)", () => {
    // склад 0.5 л → нормализовано 500 мл; строка просит 200 мл → покрыто целиком
    const index = indexInventoryEntries([entry("acid-1", lacticAcid("cat--lactic"), 500, "ml")]);
    const result = matchLineAgainstInventory(line(lacticAcid("cat--lactic"), 200, "ml"), index, 1);

    expect(result.status).toBe("covered");
    expect(result.coveragePercent).toBe(100);
    expect(result.availableQuantityNormalized).toBe(500);
    expect(result.normalizedUnit).toBe("ml");
  });

  it("частичное покрытие по объёму считает нехватку в мл", () => {
    const index = indexInventoryEntries([entry("acid-1", lacticAcid("cat--lactic"), 120, "ml")]);
    const result = matchLineAgainstInventory(line(lacticAcid("cat--lactic"), 300, "ml"), index, 1);

    expect(result.status).toBe("partial");
    expect(result.coveragePercent).toBe(40);
    expect(result.shortfallNormalized).toBe(180);
  });

  it("штучные единицы требуют точного совпадения: «item» строки не кроется «pack» склада", () => {
    // расходник (не дрожжи): count-измерение сводит item↔pack строго по единице
    const stockedInPacks = entry("c-1", { ...whirlflocTablet("cat--wf"), dimension: "count" }, 10, "pack");
    const index = indexInventoryEntries([stockedInPacks]);

    const result = matchLineAgainstInventory(line(whirlflocTablet("cat--wf"), 2, "item"), index, 1);

    expect(result.status).toBe("missing");
    expect(result.coveragePercent).toBe(0);
  });

  it("штучные единицы при совпадении единицы дают частичное покрытие по количеству", () => {
    const index = indexInventoryEntries([entry("c-1", whirlflocTablet("cat--wf"), 3, "item")]);

    const result = matchLineAgainstInventory(line(whirlflocTablet("cat--wf"), 12, "item"), index, 1);

    expect(result.status).toBe("partial");
    expect(result.coveragePercent).toBe(25);
    expect(result.shortfallNormalized).toBe(9);
  });
});

describe("matchLineAgainstInventory — замены и частичные субституты", () => {
  it("замена бренда покрывает не полностью → partial + viaSubstitute", () => {
    // того же продукта (exactKey) нет; есть другой бренд того же бакета pilsner,
    // но его не хватает под объём → строка partial, но помечена как замена
    const index = indexInventoryEntries([entry("brand-b", pilsner("brandB--pils"), 4000, "g")]);

    const result = matchLineAgainstInventory(line(pilsner("brandA--pils"), 10000, "g"), index, 1);

    expect(result.status).toBe("partial");
    expect(result.coveragePercent).toBe(40);
    expect(result.viaSubstitute).toBe(true);
    expect(result.shortfallNormalized).toBe(6000);
  });

  it("точный продукт + замена суммируются: точного мало, замена добивает до 100%", () => {
    // 3000 г того же продукта (exact) + 8000 г другого бренда (substitute) ≥ 10000.
    // Статус «substitute» (а не «covered»): «covered» требует, чтобы хватило
    // ТОЧНОГО продукта (availableExact >= required); здесь exact (3000) < 10000,
    // покрытие добирается заменой → tier «substitute» при 100% покрытия.
    const index = indexInventoryEntries([
      entry("exact", pilsner("brandA--pils"), 3000, "g"),
      entry("sub", pilsner("brandB--pils"), 8000, "g")
    ]);

    const result = matchLineAgainstInventory(line(pilsner("brandA--pils"), 10000, "g"), index, 1);

    expect(result.status).toBe("substitute");
    expect(result.coveragePercent).toBe(100);
    expect(result.availableQuantityNormalized).toBe(11000);
    expect(result.viaSubstitute).toBe(true);
  });
});

describe("matchLineAgainstInventory — кастомные vs каталожные ингредиенты", () => {
  it("кастомный ингредиент кроется тем же кастомным id (exact) и пробрасывает customId", () => {
    const index = indexInventoryEntries([entry("m-1", pilsner("custom-uuid-A", "custom"), 6000, "g")]);

    const result = matchLineAgainstInventory(line(pilsner("custom-uuid-A", "custom"), 5000, "g"), index, 1);

    expect(result.status).toBe("covered");
    expect(result.userCustomIngredientId).toBe("custom-uuid-A");
    expect(result.ingredientCatalogItemId).toBeNull();
    expect(result.viaSubstitute).toBe(false);
  });

  it("разные кастомные id одного бакета взаимозаменяемы по группе (substitute)", () => {
    const index = indexInventoryEntries([entry("m-1", pilsner("custom-uuid-A", "custom"), 9000, "g")]);

    const result = matchLineAgainstInventory(line(pilsner("custom-uuid-B", "custom"), 5000, "g"), index, 1);

    expect(result.status).toBe("substitute");
    expect(result.viaSubstitute).toBe(true);
    expect(result.coveragePercent).toBe(100);
  });

  it("каталожная строка кроется кастомной позицией склада того же бакета (substitute)", () => {
    const index = indexInventoryEntries([entry("m-custom", pilsner("custom-uuid-A", "custom"), 9000, "g")]);

    const result = matchLineAgainstInventory(line(pilsner("cat--pilsner"), 5000, "g"), index, 1);

    expect(result.status).toBe("substitute");
    expect(result.viaSubstitute).toBe(true);
  });
});

describe("matchLineAgainstInventory — подсказка «добавить на склад»", () => {
  it("для отсутствующей кислоты предлагает добавить нехватку в мл (объём)", () => {
    const result = matchLineAgainstInventory(line(lacticAcid("cat--lactic"), 200, "ml"), indexInventoryEntries([]), 1);

    expect(result.status).toBe("missing");
    expect(result.suggestedAddUnit).toBe("ml");
    expect(result.suggestedAddQuantity).toBe(200);
  });

  it("для отсутствующего штучного расходника предлагает добавить в штуках", () => {
    const result = matchLineAgainstInventory(line(whirlflocTablet("cat--wf"), 2, "item"), indexInventoryEntries([]), 1);

    expect(result.status).toBe("missing");
    expect(result.suggestedAddUnit).toBe("item");
    expect(result.suggestedAddQuantity).toBe(2);
  });

  it("частичная строка предлагает добавить ровно нехватку (с округлением вверх до covered)", () => {
    const index = indexInventoryEntries([entry("bag", pilsner("cat--pilsner"), 4000, "g")]);
    const result = matchLineAgainstInventory(line(pilsner("cat--pilsner"), 10000, "g"), index, 1);

    expect(result.status).toBe("partial");
    // нехватка 6000 г → 6 кг (человеческая единица солода)
    expect(result.suggestedAddUnit).toBe("kg");
    expect(result.suggestedAddQuantity).toBe(6);
  });
});

describe("summarizeMatch — пороги label и подсчёт строк", () => {
  // Минимальный DTO строки: summarizeMatch читает только category, coveragePercent,
  // status и displayOrder.
  const lineDto = (over: Partial<RecipeMatchLineDto>): RecipeMatchLineDto => ({
    recipeIngredientId: "ri",
    persistentKey: "ri-pk",
    displayOrder: 0,
    ingredientDisplayName: null,
    category: "fermentable",
    status: "covered",
    coveragePercent: 100,
    requiredQuantityNormalized: 0,
    availableQuantityNormalized: 0,
    shortfallNormalized: 0,
    normalizedUnit: "g",
    viaSubstitute: false,
    ingredientCatalogItemId: null,
    userCustomIngredientId: null,
    suggestedAddQuantity: null,
    suggestedAddUnit: null,
    ...over
  });

  const ctx = { targetBatchVolumeL: 20, recipeBatchVolumeL: 20 };

  it("100% → label «ready»", () => {
    const summary = summarizeMatch("r", [lineDto({ status: "covered", coveragePercent: 100 })], ctx);
    expect(summary.matchPercent).toBe(100);
    expect(summary.label).toBe("ready");
  });

  it("70% (граница) → label «almost»", () => {
    // две равновесные строки fermentable: одна покрыта (100), вторая на 40 →
    // (5*1.0 + 5*0.4)/10 = 0.70
    const summary = summarizeMatch("r", [
      lineDto({ status: "covered", coveragePercent: 100 }),
      lineDto({ status: "partial", coveragePercent: 40, displayOrder: 1 })
    ], ctx);
    expect(summary.matchPercent).toBe(70);
    expect(summary.label).toBe("almost");
  });

  it("1..69% → label «partial»", () => {
    const summary = summarizeMatch("r", [lineDto({ status: "partial", coveragePercent: 40 })], ctx);
    expect(summary.matchPercent).toBe(40);
    expect(summary.label).toBe("partial");
  });

  it("0% → label «none»", () => {
    const summary = summarizeMatch("r", [lineDto({ status: "missing", coveragePercent: 0 })], ctx);
    expect(summary.matchPercent).toBe(0);
    expect(summary.label).toBe("none");
  });

  it("substitute учитывается как покрытая строка, missing — как отсутствующая", () => {
    const summary = summarizeMatch("r", [
      lineDto({ status: "covered", coveragePercent: 100 }),
      lineDto({ status: "substitute", coveragePercent: 100, displayOrder: 1 }),
      lineDto({ status: "partial", coveragePercent: 50, displayOrder: 2 }),
      lineDto({ status: "missing", coveragePercent: 0, displayOrder: 3 })
    ], ctx);

    expect(summary.totalLines).toBe(4);
    expect(summary.coveredLines).toBe(2); // covered + substitute
    expect(summary.missingCount).toBe(1);
  });

  it("строки в итоге отсортированы по displayOrder", () => {
    const summary = summarizeMatch("r", [
      lineDto({ recipeIngredientId: "b", displayOrder: 2 }),
      lineDto({ recipeIngredientId: "a", displayOrder: 0 }),
      lineDto({ recipeIngredientId: "c", displayOrder: 1 })
    ], ctx);

    expect(summary.lines.map((l) => l.recipeIngredientId)).toEqual(["a", "c", "b"]);
  });
});

// --- хелперы для DB-завязанного публичного API -----------------------------

const inventoryItem = (over: Record<string, unknown> = {}) => ({
  id: "inv-1",
  normalizedQuantity: 12000,
  normalizedUnit: "g",
  unitDimension: "weight",
  archivedAt: null,
  ingredientCatalogItemId: "kursk--pilsner",
  userCustomIngredientId: null,
  ingredientCategory: "fermentable",
  ingredientSubtype: "malt",
  ingredientDisplayNameSnapshot: "Pilsner",
  source: {
    category: "fermentable",
    type: "malt",
    displayName: "Pilsner",
    nameRu: "Пилснер",
    nameEn: "Pilsner",
    subtype: "malt",
    technicalData: { type: "malt", maltType: "base", colorEbcMin: 2, colorEbcMax: 4 }
  },
  ...over
});

const recipeIngredientRow = (over: Record<string, unknown> = {}) => ({
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
  ...over
});

const recipeRow = (id: string, ingredients: Record<string, unknown>[], over: Record<string, unknown> = {}) => ({
  id,
  slug: `${id}-slug`,
  title: `Recipe ${id}`,
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  saveCount: 0,
  publicationState: "published",
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ingredients,
  ...over
});

describe("computeRecipeMatch — сквозной журнал склад+рецепт", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("пустой склад → все строки missing, matchPercent 0, label «none»", () => {
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
    (listInventoryForUser as Mock).mockResolvedValue([]);
    (listEquipmentProfiles as Mock).mockResolvedValue([]);

    return computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1" }).then((result) => {
      expect(result.matchPercent).toBe(0);
      expect(result.label).toBe("none");
      expect(result.missingCount).toBe(1);
      expect(result.coveredLines).toBe(0);
      // нет equipment-профиля и явного объёма → целевой = объём рецепта, без масштаба
      expect(result.scaledToInventory).toBe(false);
    });
  });

  it("multi-line рецепт: covered + substitute + partial + missing сводятся в один %", async () => {
    (getRecipeById as Mock).mockResolvedValue({
      id: "recipe-2",
      batchSizeNormalizedQuantity: 20000,
      batchSizeNormalizedUnit: "ml",
      ingredients: [
        {
          id: "ri-pils", persistentKey: "ri-pils-pk", displayOrder: 0,
          ingredientDisplayName: "Pilsner", ingredientCategory: "fermentable", ingredientSubtype: "malt", type: "malt",
          ingredientTechnicalData: { type: "malt", maltType: "base", colorEbcMin: 2, colorEbcMax: 4 },
          ingredientCatalogItemId: "kursk--pilsner", userCustomIngredientId: null,
          amountNormalizedQuantity: 5000, amountNormalizedUnit: "g"
        },
        {
          id: "ri-cara", persistentKey: "ri-cara-pk", displayOrder: 1,
          ingredientDisplayName: "Caramel", ingredientCategory: "fermentable", ingredientSubtype: "malt", type: "malt",
          ingredientTechnicalData: { type: "malt", maltType: "specialty", colorEbcMin: 40, colorEbcMax: 60 },
          ingredientCatalogItemId: "x--caramel", userCustomIngredientId: null,
          amountNormalizedQuantity: 1000, amountNormalizedUnit: "g"
        }
      ]
    });
    (listInventoryForUser as Mock).mockResolvedValue([
      // другой бренд того же пилзнера (substitute), хватает на покрытие
      inventoryItem({ id: "inv-pils", ingredientCatalogItemId: "soufflet--pilsner", normalizedQuantity: 12000 })
    ]);
    (listEquipmentProfiles as Mock).mockResolvedValue([]);

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-2" });

    expect(result.totalLines).toBe(2);
    // pilsner покрыт заменой; caramel отсутствует на складе
    const pilsnerLine = result.lines.find((l) => l.persistentKey === "ri-pils-pk");
    const caramelLine = result.lines.find((l) => l.persistentKey === "ri-cara-pk");
    expect(pilsnerLine?.status).toBe("substitute");
    expect(caramelLine?.status).toBe("missing");
    expect(result.coveredLines).toBe(1);
    expect(result.missingCount).toBe(1);
    // оба fermentable (вес 5): (5*1.0 + 5*0.0)/10 = 50%
    expect(result.matchPercent).toBe(50);
    expect(result.label).toBe("partial");
  });

  it("явный targetBatchVolumeL масштабирует требования и игнорирует equipment-дефолт", async () => {
    (getRecipeById as Mock).mockResolvedValue({
      id: "recipe-3",
      batchSizeNormalizedQuantity: 20000,
      batchSizeNormalizedUnit: "ml",
      ingredients: [
        {
          id: "ri-1", persistentKey: "ri-1-pk", displayOrder: 0,
          ingredientDisplayName: "Pilsner", ingredientCategory: "fermentable", ingredientSubtype: "malt", type: "malt",
          ingredientTechnicalData: { type: "malt", maltType: "base", colorEbcMin: 2, colorEbcMax: 4 },
          ingredientCatalogItemId: "kursk--pilsner", userCustomIngredientId: null,
          amountNormalizedQuantity: 5000, amountNormalizedUnit: "g"
        }
      ]
    });
    (listInventoryForUser as Mock).mockResolvedValue([
      inventoryItem({ id: "inv-pils", ingredientCatalogItemId: "kursk--pilsner", normalizedQuantity: 6000 })
    ]);

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-3", targetBatchVolumeL: 10 });

    // 20л рецепт → 10л партия: фактор 0.5 → нужно 2500 г, на складе 6000 г → covered
    expect(result.targetBatchVolumeL).toBe(10);
    expect(result.recipeBatchVolumeL).toBe(20);
    expect(result.scaledToInventory).toBe(true);
    expect(result.lines[0].requiredQuantityNormalized).toBe(2500);
    expect(result.lines[0].status).toBe("covered");
    // явный объём задан → equipment-профиль не запрашивается
    expect(listEquipmentProfiles).not.toHaveBeenCalled();
  });
});

describe("findBrewableRecipesForUser — обратный матчинг и ранжирование", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const seedSinglePilsnerInventory = () => {
    (listInventoryForUser as Mock).mockResolvedValue([
      inventoryItem({ id: "inv-pils", ingredientCatalogItemId: "kursk--pilsner", normalizedQuantity: 20000 })
    ]);
    (listEquipmentProfiles as Mock).mockResolvedValue([]);
    (db.query.ingredients.findMany as Mock).mockResolvedValue([]);
  };

  it("ранжирует по matchPercent убыванию (полный рецепт выше частичного)", async () => {
    seedSinglePilsnerInventory();
    (db.query.recipes.findMany as Mock).mockResolvedValue([
      recipeRow("half", [
        recipeIngredientRow({ id: "h1", persistentKey: "h1" }),
        recipeIngredientRow({
          id: "h2", persistentKey: "h2", displayOrder: 1,
          ingredientDisplayNameSnapshot: "Munich", ingredientCatalogItemId: "x--munich", amountNormalizedQuantity: 1000
        })
      ]),
      recipeRow("full", [recipeIngredientRow({ id: "f1", persistentKey: "f1" })])
    ]);

    const result = await findBrewableRecipesForUser({ userId: "u-1" });

    expect(result.map((r) => r.recipeId)).toEqual(["full", "half"]);
    expect(result[0].matchPercent).toBe(100);
    expect(result[1].matchPercent).toBeLessThan(100);
  });

  it("minMatchPercent отсекает слабые совпадения", async () => {
    seedSinglePilsnerInventory();
    (db.query.recipes.findMany as Mock).mockResolvedValue([
      recipeRow("full", [recipeIngredientRow({ id: "f1", persistentKey: "f1" })]),
      recipeRow("half", [
        recipeIngredientRow({ id: "h1", persistentKey: "h1" }),
        recipeIngredientRow({
          id: "h2", persistentKey: "h2", displayOrder: 1,
          ingredientDisplayNameSnapshot: "Munich", ingredientCatalogItemId: "x--munich", amountNormalizedQuantity: 1000
        })
      ])
    ]);

    const result = await findBrewableRecipesForUser({ userId: "u-1", minMatchPercent: 90 });

    expect(result.map((r) => r.recipeId)).toEqual(["full"]);
  });

  it("limit ограничивает число рецептов", async () => {
    seedSinglePilsnerInventory();
    (db.query.recipes.findMany as Mock).mockResolvedValue([
      recipeRow("a", [recipeIngredientRow({ id: "a1", persistentKey: "a1" })]),
      recipeRow("b", [recipeIngredientRow({ id: "b1", persistentKey: "b1" })])
    ]);

    const result = await findBrewableRecipesForUser({ userId: "u-1", limit: 1 });

    expect(result).toHaveLength(1);
  });

  it("пустой склад → пусто, без запроса рецептов", async () => {
    (listInventoryForUser as Mock).mockResolvedValue([]);
    (listEquipmentProfiles as Mock).mockResolvedValue([]);

    const result = await findBrewableRecipesForUser({ userId: "u-1" });

    expect(result).toEqual([]);
    expect(db.query.recipes.findMany).not.toHaveBeenCalled();
  });

  it("рецепты без ингредиентов исключаются из выдачи", async () => {
    seedSinglePilsnerInventory();
    (db.query.recipes.findMany as Mock).mockResolvedValue([
      recipeRow("full", [recipeIngredientRow({ id: "f1", persistentKey: "f1" })]),
      recipeRow("empty", [])
    ]);

    const result = await findBrewableRecipesForUser({ userId: "u-1" });

    expect(result.map((r) => r.recipeId)).toEqual(["full"]);
  });
});

describe("findBrewableOwnRecipesForUser — свои рецепты «можно сварить сейчас»", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listInventoryForUser as Mock).mockResolvedValue([
      inventoryItem({ id: "inv-pils", ingredientCatalogItemId: "kursk--pilsner", normalizedQuantity: 20000 })
    ]);
    (listEquipmentProfiles as Mock).mockResolvedValue([]);
    (db.query.ingredients.findMany as Mock).mockResolvedValue([]);
  });

  const ownRow = (id: string, family: string, version: number, ingredients: Record<string, unknown>[]) => ({
    ...recipeRow(id, ingredients, { recipeFamilyId: family, versionNumber: version, authorId: "u-1" })
  });

  it("схлопывает семейство до последней версии и оставляет только полностью покрытые", async () => {
    (db.query.recipes.findMany as Mock).mockResolvedValue([
      ownRow("ipa-v1", "fam-ipa", 1, [recipeIngredientRow({ id: "v1", persistentKey: "v1" })]),
      ownRow("ipa-v2", "fam-ipa", 2, [recipeIngredientRow({ id: "v2", persistentKey: "v2" })]),
      // другое семейство, ингредиента нет на складе → не «ready», в выдачу не попадает
      ownRow("stout", "fam-stout", 1, [
        recipeIngredientRow({
          id: "s1", persistentKey: "s1",
          ingredientDisplayNameSnapshot: "Roasted barley", ingredientCatalogItemId: "x--roasted"
        })
      ])
    ]);

    const result = await findBrewableOwnRecipesForUser({ userId: "u-1" });

    // только последняя версия IPA, stout отсеян как не-ready
    expect(result.map((r) => r.recipeId)).toEqual(["ipa-v2"]);
    expect(result[0].matchPercent).toBe(100);
  });

  it("рецепт с одной отсутствующей позицией («almost») не считается готовым к варке", async () => {
    (db.query.recipes.findMany as Mock).mockResolvedValue([
      ownRow("amber", "fam-amber", 1, [
        recipeIngredientRow({ id: "a1", persistentKey: "a1" }),
        recipeIngredientRow({
          id: "a2", persistentKey: "a2", displayOrder: 1,
          ingredientDisplayNameSnapshot: "Munich", ingredientCatalogItemId: "x--munich", amountNormalizedQuantity: 1000
        })
      ])
    ]);

    const result = await findBrewableOwnRecipesForUser({ userId: "u-1" });

    expect(result).toEqual([]);
  });

  it("пустой склад → пусто", async () => {
    (listInventoryForUser as Mock).mockResolvedValue([]);
    (listEquipmentProfiles as Mock).mockResolvedValue([]);

    const result = await findBrewableOwnRecipesForUser({ userId: "u-1" });

    expect(result).toEqual([]);
    expect(db.query.recipes.findMany).not.toHaveBeenCalled();
  });
});

describe("matchLineAgainstInventory — дубликаты строк рецепта", () => {
  it("две одинаковые строки независимо «видят» один и тот же запас (см. отчёт)", () => {
    // ВНИМАНИЕ: матч идёт построчно, склад между строками не вычитается. Две
    // строки одного хмеля по 50 г при наличии 50 г обе помечаются covered, хотя
    // суммарно требуется 100 г. Для discovery-матча (по наличию) это by-design,
    // но как количественная гарантия «хватит на всю варку» — завышение. Тест
    // фиксирует фактическое поведение, не утверждая его корректность.
    const cascade: IngredientMatchProfile = {
      category: "hop", type: "hop", name: "Cascade", nameEn: "Cascade",
      catalogItemId: "cat--cascade", dimension: "weight"
    };
    const index = indexInventoryEntries([entry("hop-1", cascade, 50, "g")]);

    const first = matchLineAgainstInventory(line(cascade, 50, "g", "hop-line-1"), index, 1);
    const second = matchLineAgainstInventory(line(cascade, 50, "g", "hop-line-2"), index, 1);

    expect(first.status).toBe("covered");
    expect(second.status).toBe("covered");
  });
});

describe("convertNormalizedQuantityToEnteredUnit — чистая конверсия складских единиц", () => {
  it("совпадающие единицы → без изменений", () => {
    expect(convertNormalizedQuantityToEnteredUnit(500, "g", "g")).toBe(500);
    expect(convertNormalizedQuantityToEnteredUnit(3, "pack", "pack")).toBe(3);
  });

  it("вес g → kg/oz/lb", () => {
    expect(convertNormalizedQuantityToEnteredUnit(1000, "g", "kg")).toBe(1);
    expect(convertNormalizedQuantityToEnteredUnit(1000, "g", "oz")).toBe(35.274);
    expect(convertNormalizedQuantityToEnteredUnit(1000, "g", "lb")).toBe(2.205);
  });

  it("объём ml → l/gal", () => {
    expect(convertNormalizedQuantityToEnteredUnit(1000, "ml", "l")).toBe(1);
    expect(convertNormalizedQuantityToEnteredUnit(1000, "ml", "gal")).toBe(0.264);
  });

  it("конверсия между измерениями невозможна → null", () => {
    expect(convertNormalizedQuantityToEnteredUnit(500, "g", "ml")).toBeNull();
    expect(convertNormalizedQuantityToEnteredUnit(3, "item", "g")).toBeNull();
  });
});

describe("listRecipeStockCoverage — нехватка выбранного склада под строку", () => {
  beforeEach(() => {
    mockState.recipes = [{ id: "rec-1", authorId: "user-1", title: "Recipe" }];
    mockState.lines = [{
      id: "line-1",
      recipeId: "rec-1",
      persistentKey: "pk-1",
      displayOrder: 0,
      ingredientCatalogItemId: "hop-cascade",
      userCustomIngredientId: null,
      ingredientDisplayNameSnapshot: "Cascade",
      amountNormalizedQuantity: 100,
      amountNormalizedUnit: "g"
    }];
    mockState.allocations = [{
      id: "alloc-1",
      userId: "user-1",
      recipeId: "rec-1",
      recipeIngredientId: "line-1",
      recipeIngredientPersistentKey: "pk-1",
      inventoryItemId: "inv-1",
      status: "allocated",
      allocatedQuantityNormalized: 100,
      allocatedNormalizedUnit: "g",
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    }];
    mockState.inventory = [{
      id: "inv-1",
      userId: "user-1",
      ingredientCatalogItemId: "hop-cascade",
      userCustomIngredientId: null,
      ingredientDisplayNameSnapshot: "Cascade stock",
      normalizedQuantity: 40,
      normalizedUnit: "g",
      enteredQuantity: 40,
      enteredUnit: "g",
      archivedAt: null,
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    }];
  });

  it("аллокация есть, но фактический остаток ниже требуемого → статус «short»", async () => {
    const coverage = await listRecipeStockCoverage("user-1", "rec-1");

    expect(coverage.lines[0].status).toBe("short");
    expect(coverage.lines[0].availableQuantityNormalized).toBe(40);
    expect(coverage.lines[0].requiredQuantityNormalized).toBe(100);
    expect(coverage.summary.shortLines).toBe(1);
    expect(coverage.summary.selectedLines).toBe(1);
  });
});

// --- сквозной путь кредита партии: аллокации в БД → кредит → матч -----------

// В отличие от recipe-match-service.test.ts (там источник кредита замокан),
// здесь работает НАСТОЯЩИЙ getBrewBatchInventoryCredits поверх in-memory @nb/db:
// проверяем, что именно consumed-аллокации ИМЕННО ЭТОЙ партии доезжают до матча.
// Кейс живого прогона: рецепт требует 4000 г пильзнера, партия их списала,
// на складе остался 1000 г — и матч этой же партии показывал «не хватает 3 кг».
describe("computeRecipeMatch + кредит партии — сквозной путь по аллокациям", () => {
  const BATCH_ID = "bb-1";
  const OTHER_BATCH_ID = "bb-2";

  const consumedAllocation = (over: Record<string, unknown> = {}) => ({
    id: "alloc-pils",
    userId: "u-1",
    recipeId: "recipe-1",
    recipeIngredientId: "ri-1",
    recipeIngredientPersistentKey: "ri-1-pk",
    inventoryItemId: "inv-pils",
    brewBatchId: BATCH_ID,
    status: "consumed",
    allocatedQuantityNormalized: 4000,
    allocatedNormalizedUnit: "g",
    ...over
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.allocations = [];
    (listEquipmentProfiles as Mock).mockResolvedValue([]);
    (getRecipeById as Mock).mockResolvedValue({
      id: "recipe-1",
      batchSizeNormalizedQuantity: 20000,
      batchSizeNormalizedUnit: "ml",
      ingredients: [
        {
          id: "ri-1", persistentKey: "ri-1-pk", displayOrder: 0,
          ingredientDisplayName: "Пильзнер", ingredientCategory: "fermentable", ingredientSubtype: "malt", type: "malt",
          ingredientTechnicalData: { type: "malt", maltType: "base", colorEbcMin: 2, colorEbcMax: 4 },
          ingredientCatalogItemId: "kursk--pilsner", userCustomIngredientId: null,
          amountNormalizedQuantity: 4000, amountNormalizedUnit: "g"
        }
      ]
    });
    // Остаток после списания: было 5000 г, партия забрала 4000 г.
    (listInventoryForUser as Mock).mockResolvedValue([
      inventoryItem({ id: "inv-pils", ingredientCatalogItemId: "kursk--pilsner", normalizedQuantity: 1000 })
    ]);
  });

  it("consumed-аллокация партии возвращается в матч этой партии → covered", async () => {
    mockState.allocations = [consumedAllocation()];

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1", brewBatchId: BATCH_ID });

    expect(result.lines[0].status).toBe("covered");
    expect(result.lines[0].availableQuantityNormalized).toBe(5000);
    expect(result.lines[0].shortfallNormalized).toBe(0);
    expect(result.matchPercent).toBe(100);
  });

  it("тот же склад без партии — прежний результат (partial, нехватка 3000 г)", async () => {
    mockState.allocations = [consumedAllocation()];

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1" });

    expect(result.lines[0].status).toBe("partial");
    expect(result.lines[0].shortfallNormalized).toBe(3000);
  });

  it("кредит ЧУЖОЙ партии не засчитывается", async () => {
    mockState.allocations = [consumedAllocation({ brewBatchId: OTHER_BATCH_ID })];

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1", brewBatchId: BATCH_ID });

    expect(result.lines[0].status).toBe("partial");
    expect(result.lines[0].shortfallNormalized).toBe(3000);
  });

  it("возврат на склад (released) снимает кредит — нехватка честно возвращается", async () => {
    // restoreBrewBatchInventory переводит аллокации в released; кредит считает
    // только consumed, поэтому исчезает сам, без отдельного отката.
    mockState.allocations = [consumedAllocation({ status: "released" })];

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1", brewBatchId: BATCH_ID });

    expect(result.lines[0].status).toBe("partial");
    expect(result.lines[0].shortfallNormalized).toBe(3000);
  });

  it("аллокация другого пользователя не даёт кредита", async () => {
    mockState.allocations = [consumedAllocation({ userId: "u-2" })];

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1", brewBatchId: BATCH_ID });

    expect(result.lines[0].status).toBe("partial");
  });

  it("несколько consumed-аллокаций на одну позицию склада суммируются", async () => {
    mockState.allocations = [
      consumedAllocation({ id: "alloc-a", allocatedQuantityNormalized: 2500 }),
      consumedAllocation({ id: "alloc-b", recipeIngredientId: "ri-2", allocatedQuantityNormalized: 1500 })
    ];

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1", brewBatchId: BATCH_ID });

    expect(result.lines[0].availableQuantityNormalized).toBe(5000);
    expect(result.lines[0].status).toBe("covered");
  });

  it("позиция, списанная В НОЛЬ, остаётся в индексе (кредит применяется до отсечки «>0»)", async () => {
    (listInventoryForUser as Mock).mockResolvedValue([
      inventoryItem({ id: "inv-pils", ingredientCatalogItemId: "kursk--pilsner", normalizedQuantity: 0 })
    ]);
    mockState.allocations = [consumedAllocation()];

    const result = await computeRecipeMatch({ userId: "u-1", recipeId: "recipe-1", brewBatchId: BATCH_ID });

    expect(result.lines[0].status).toBe("covered");
    expect(result.lines[0].availableQuantityNormalized).toBe(4000);
  });
});
