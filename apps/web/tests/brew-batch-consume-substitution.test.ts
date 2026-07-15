import { beforeEach, describe, expect, it, vi } from "vitest";

// Ф2: «списание предлагает замены по match-group» — интеграционные тесты превью
// (previewBrewBatchConsumption) и реального списания с заменой
// (consumeBrewBatchInventory) поверх РЕАЛЬНОГО движка аллокаций
// (features/recipes/inventory-service.ts) и РЕАЛЬНОГО резолвера матча
// (features/recipes/match-service.ts) — не фейковых заглушек, как в
// coverage-brew-batches-lifecycle.test.ts (там движок аллокаций подменён
// фикстурой). Здесь предпросмотр обязан находить ровно те же позиции, что
// затем реально спишет consume — это и проверяем.

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const USER_ID = uuid(9);
const OTHER_USER_ID = uuid(999);
const RECIPE_ID = uuid(1);

const { tableRefs, mockState } = vi.hoisted(() => ({
  tableRefs: {
    recipes: { name: "recipes", id: "id", authorId: "authorId" },
    recipeIngredients: { name: "recipe_ingredients", id: "id", recipeId: "recipeId", persistentKey: "persistentKey" },
    recipeInventoryAllocations: {
      name: "recipe_inventory_allocations",
      id: "id",
      userId: "userId",
      recipeId: "recipeId",
      recipeIngredientId: "recipeIngredientId",
      brewBatchId: "brewBatchId",
      status: "status"
    },
    inventoryTransactions: {
      name: "inventory_transactions",
      id: "id",
      userId: "userId",
      brewBatchId: "brewBatchId",
      createdAt: "createdAt"
    },
    userIngredients: {
      name: "user_ingredients",
      id: "id",
      userId: "userId",
      ingredientCatalogItemId: "ingredientCatalogItemId",
      userCustomIngredientId: "userCustomIngredientId",
      normalizedQuantity: "normalizedQuantity",
      normalizedUnit: "normalizedUnit",
      enteredQuantity: "enteredQuantity",
      enteredUnit: "enteredUnit",
      packageVariantId: "packageVariantId",
      archivedAt: "archivedAt"
    },
    brewBatches: { name: "brew_batches", id: "id", userId: "userId", status: "status" },
    ingredients: { name: "ingredients", id: "id" },
    userCustomIngredients: { name: "user_custom_ingredients", id: "id" },
    ingredientPackageVariants: { name: "ingredient_package_variants", id: "id" }
  },
  mockState: {
    recipes: [] as any[],
    lines: [] as any[],
    inventory: [] as any[],
    allocations: [] as any[],
    transactions: [] as any[],
    brewBatches: [] as any[],
    catalogItems: [] as any[],
    enrichedInventory: [] as any[],
    idCounter: 0
  }
}));

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

  const hasIsNull = (where: any, key: string): boolean => {
    const items = Array.isArray(where) ? where.flat(8) : [where];
    return items.includes(`null:${key}`);
  };

  const batchScopeMatcher = (where: any) => {
    const brewBatchId = getEqValue(where, "brewBatchId");
    const scopedToNoBatch = hasIsNull(where, "brewBatchId");
    return (allocation: any) => {
      if (scopedToNoBatch) {
        return !allocation.brewBatchId;
      }
      if (brewBatchId !== undefined) {
        return allocation.brewBatchId === brewBatchId;
      }
      return true;
    };
  };

  const tableRows = (tableName: string): any[] => {
    if (tableName === "user_ingredients") return mockState.inventory;
    if (tableName === "brew_batches") return mockState.brewBatches;
    if (tableName === "recipe_inventory_allocations") return mockState.allocations;
    if (tableName === "inventory_transactions") return mockState.transactions;
    return [];
  };

  // db.select({...}?).from(t).where(...).for("update") | .orderBy(asc(...)) —
  // блокирующее чтение остатка (consume/restore) и хронологический журнал
  // (loadBatchTransactions). Без projection отдаёт полные строки как есть.
  const select = (projection?: Record<string, string>) => {
    const state: { table: string | null; where: any; orderKey: string | null } = {
      table: null,
      where: null,
      orderKey: null
    };
    const resolve = () => {
      const id = getEqValue(state.where, "id");
      const userId = getEqValue(state.where, "userId");
      const brewBatchId = getEqValue(state.where, "brewBatchId");
      let rows = tableRows(state.table ?? "").filter((row) => (
        (id === undefined || row.id === id)
        && (userId === undefined || row.userId === userId)
        && (brewBatchId === undefined || row.brewBatchId === brewBatchId)
      ));
      if (state.orderKey) {
        const key = state.orderKey;
        rows = [...rows].sort((left, right) => (left[key] > right[key] ? 1 : left[key] < right[key] ? -1 : 0));
      }
      if (!projection) {
        return rows.map((row) => ({ ...row }));
      }
      return rows.map((row) => {
        const projected: Record<string, unknown> = {};
        for (const [key, column] of Object.entries(projection)) {
          projected[key] = row[column];
        }
        return projected;
      });
    };
    const builder: any = {
      from: (table: { name: string }) => {
        state.table = table.name;
        return builder;
      },
      where: (where: any) => {
        state.where = where;
        return builder;
      },
      for: () => builder,
      orderBy: (orderSpec: string) => {
        if (typeof orderSpec === "string" && orderSpec.startsWith("asc:")) {
          state.orderKey = orderSpec.slice(4);
        }
        return builder;
      },
      then: (onFulfilled: any, onRejected: any) => Promise.resolve(resolve()).then(onFulfilled, onRejected)
    };
    return builder;
  };

  const db: any = {
    select,
    query: {
      recipes: {
        findFirst: async (arg: any) => {
          const id = getEqValue(arg?.where, "id");
          return mockState.recipes.find((recipe) => recipe.id === id) ?? null;
        }
      },
      recipeIngredients: {
        findMany: async (arg: any) => {
          const recipeId = getEqValue(arg?.where, "recipeId");
          return mockState.lines.filter((line) => line.recipeId === recipeId);
        }
      },
      recipeInventoryAllocations: {
        findMany: async (arg: any) => {
          const userId = getEqValue(arg?.where, "userId");
          const recipeId = getEqValue(arg?.where, "recipeId");
          const status = getEqValue(arg?.where, "status");
          const statuses = getInArrayValue(arg?.where, "status");
          const inScope = batchScopeMatcher(arg?.where);
          return mockState.allocations
            .filter((allocation) => (
              allocation.userId === userId
              && (recipeId === undefined || allocation.recipeId === recipeId)
              && inScope(allocation)
              && (status === undefined || allocation.status === status)
              && (!statuses || statuses.includes(allocation.status))
            ))
            .sort((left, right) => String(left.inventoryItemId).localeCompare(String(right.inventoryItemId)) || String(left.id).localeCompare(String(right.id)));
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
      ingredients: {
        findFirst: async (arg: any) => {
          const id = getEqValue(arg?.where, "id");
          return mockState.catalogItems.find((item) => item.id === id) ?? null;
        },
        findMany: async (arg: any) => {
          const ids = getInArrayValue(arg?.where, "id");
          return mockState.catalogItems.filter((item) => !ids || ids.includes(item.id));
        }
      },
      userCustomIngredients: {
        findFirst: async () => null
      },
      ingredientPackageVariants: {
        findFirst: async () => null
      }
    },
    insert: (table: { name: string }) => ({
      values: (values: any) => {
        if (table.name === "recipe_inventory_allocations") {
          mockState.allocations.push({
            ...values,
            id: uuid(3000 + ++mockState.idCounter),
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
        if (table.name === "inventory_transactions") {
          mockState.transactions.push({
            ...values,
            id: uuid(4000 + ++mockState.idCounter),
            createdAt: new Date(Date.UTC(2026, 0, 1) + mockState.idCounter * 1000)
          });
        }
        return { returning: async () => [values] };
      }
    }),
    update: (table: { name: string }) => ({
      set: (set: any) => ({
        where: (where: any) => {
          const updated: any[] = [];
          if (table.name === "recipe_inventory_allocations") {
            const id = getEqValue(where, "id");
            const ids = getInArrayValue(where, "id");
            const userId = getEqValue(where, "userId");
            const recipeId = getEqValue(where, "recipeId");
            const lineId = getEqValue(where, "recipeIngredientId");
            const status = getEqValue(where, "status");
            const statuses = getInArrayValue(where, "status");
            const addressedById = Boolean(id || ids);
            const inScope = addressedById ? () => true : batchScopeMatcher(where);
            mockState.allocations = mockState.allocations.map((allocation) => {
              const matches = (
                (id ? allocation.id === id : true)
                && (!ids || ids.includes(allocation.id))
                && (userId ? allocation.userId === userId : true)
                && (recipeId ? allocation.recipeId === recipeId : true)
                && (lineId ? allocation.recipeIngredientId === lineId : true)
                && inScope(allocation)
                && (status === undefined || allocation.status === status)
                && (!statuses || statuses.includes(allocation.status))
              );
              if (!matches) {
                return allocation;
              }
              const next = { ...allocation, ...set };
              updated.push(next);
              return next;
            });
          }
          if (table.name === "recipe_ingredients") {
            const id = getEqValue(where, "id");
            mockState.lines = mockState.lines.map((line) => {
              if (line.id !== id) {
                return line;
              }
              const next = { ...line, ...set };
              updated.push(next);
              return next;
            });
          }
          if (table.name === "user_ingredients") {
            const id = getEqValue(where, "id");
            mockState.inventory = mockState.inventory.map((item) => {
              if (item.id !== id) {
                return item;
              }
              const next = { ...item, ...set };
              updated.push(next);
              return next;
            });
          }
          return { returning: async () => updated };
        }
      })
    }),
    transaction: async (callback: (tx: any) => Promise<any>) => callback(db)
  };

  return {
    db,
    and: (...args: unknown[]) => args,
    eq: (...args: unknown[]) => args,
    inArray: (column: string, values: string[]) => [`in:${column}`, values],
    isNull: (column: string) => [`null:${column}`],
    asc: (column: string) => `asc:${column}`,
    inventoryTransactions: tableRefs.inventoryTransactions,
    recipeIngredients: tableRefs.recipeIngredients,
    recipeInventoryAllocations: tableRefs.recipeInventoryAllocations,
    recipes: tableRefs.recipes,
    userIngredients: tableRefs.userIngredients,
    brewBatches: tableRefs.brewBatches,
    ingredients: tableRefs.ingredients,
    userCustomIngredients: tableRefs.userCustomIngredients,
    ingredientPackageVariants: tableRefs.ingredientPackageVariants
  };
});

// Ф2: buildBrewBatchConsumeLinePlanEntries тянет listInventoryForUser лениво
// (динамический import — см. features/recipes/inventory-service.ts), но vi.mock
// перехватывает модуль независимо от того, статический он или динамический.
vi.mock("../features/inventory/service", () => ({
  listInventoryForUser: vi.fn(async (userId: string) => mockState.enrichedInventory.filter((item) => item.userId === userId))
}));

// features/brew-batches/inventory.ts зовёт из ./service только getBrewBatchById —
// подменяем его напрямую вместо того, чтобы гонять zod-схему снапшота через
// настоящий service.ts (там же rate-limit/createBrewBatchFromRecipe, не по теме
// этого файла).
vi.mock("../features/brew-batches/service", () => ({
  getBrewBatchById: async (userId: string, brewBatchId: string) =>
    mockState.brewBatches.find((batch) => batch.id === brewBatchId && batch.userId === userId) ?? null
}));

import {
  consumeBrewBatchInventory,
  previewBrewBatchConsumption,
  restoreBrewBatchInventory
} from "../features/brew-batches/inventory";

const makeBrewPlanSnapshot = (batchSizeL: number) => ({
  recipe: { batchSizeL, efficiencyPct: null, recipeEfficiencyPct: null }
});

const makeBatch = (id: string, overrides: Partial<Record<string, unknown>> = {}) => ({
  id,
  userId: USER_ID,
  recipeId: RECIPE_ID,
  status: "planned",
  brewPlanSnapshot: makeBrewPlanSnapshot(20),
  ...overrides
});

const catalog = (id: string, type: string, nameRu: string, nameEn: string, attributes: Record<string, unknown>) => ({
  id,
  type,
  nameRu,
  nameEn,
  attributes
});

// .length-based id (пока элемент ещё не попал в mockState-массив) давал
// коллизии: несколько line()/shelfItem() строятся ДО присвоения в
// mockState.lines/inventory, и все получали один и тот же id. Монотонный
// счётчик — гарантированно разные id независимо от порядка сборки/присвоения.
let lineCounter = 0;
let shelfCounter = 0;

const line = (overrides: Partial<Record<string, unknown>>) => {
  const n = lineCounter++;
  return {
    id: uuid(100 + n),
    recipeId: RECIPE_ID,
    persistentKey: uuid(1100 + n),
    displayOrder: n,
    ingredientCatalogItemId: null,
    userCustomIngredientId: null,
    inventorySelectionMeta: null,
    ...overrides
  };
};

const shelfItem = (overrides: Partial<Record<string, unknown>>) => ({
  id: uuid(200 + shelfCounter++),
  userId: USER_ID,
  ingredientCatalogItemId: null,
  userCustomIngredientId: null,
  packageVariantId: null,
  archivedAt: null,
  enteredUnit: overrides.normalizedUnit,
  enteredQuantity: overrides.normalizedQuantity,
  ...overrides
});

// Обогащённая позиция склада (то, что реально отдаёт listInventoryForUser) —
// нужна ТОЛЬКО подбору замен (findSubstituteCandidatesForLine); точный подбор
// (findOwnedInventoryItemByRecipeLineSource) ходит в сырой userIngredients.
const enrichedItem = (shelf: any, options: {
  category: string;
  type: string;
  displayName: string;
  technicalData?: Record<string, unknown> | null;
  ownerId?: string;
}) => ({
  id: shelf.id,
  userId: options.ownerId ?? shelf.userId,
  ingredientCatalogItemId: shelf.ingredientCatalogItemId,
  userCustomIngredientId: shelf.userCustomIngredientId,
  ingredientCategory: options.category,
  ingredientDisplayNameSnapshot: shelf.ingredientDisplayNameSnapshot ?? options.displayName,
  normalizedQuantity: shelf.normalizedQuantity,
  normalizedUnit: shelf.normalizedUnit,
  unitDimension: shelf.normalizedUnit === "g" || shelf.normalizedUnit === "kg" ? "weight" : "count",
  archivedAt: shelf.archivedAt ?? null,
  source: {
    sourceKind: "catalog",
    sourceId: shelf.ingredientCatalogItemId,
    type: options.type,
    category: options.category,
    displayName: options.displayName,
    nameRu: options.displayName,
    nameEn: options.displayName,
    normalizedName: options.displayName.toLowerCase(),
    technicalData: options.technicalData ?? null
  }
});

beforeEach(() => {
  lineCounter = 0;
  shelfCounter = 0;
  mockState.recipes = [{
    id: RECIPE_ID,
    authorId: USER_ID,
    // 20 л — тот же объём, что и в brewPlanSnapshot.recipe.batchSizeL: фактор 1,
    // требование строки = amountNormalizedQuantity как есть.
    batchSizeNormalizedQuantity: 20000,
    batchSizeNormalizedUnit: "ml"
  }];
  mockState.lines = [];
  mockState.inventory = [];
  mockState.allocations = [];
  mockState.transactions = [];
  mockState.brewBatches = [];
  mockState.catalogItems = [];
  mockState.enrichedInventory = [];
});

describe("previewBrewBatchConsumption — классификация строк", () => {
  it("exact / exact_short / substitute_available / missing — по одному примеру каждого", async () => {
    mockState.catalogItems = [
      catalog("beerex--pilsner", "malt", "Пилснер", "Pilsner", { malt_type: "base", color_ebc_min: 3, color_ebc_max: 4 }),
      catalog("kursk--pilsner", "malt", "Пилснер", "Pilsner", { malt_type: "base", color_ebc_min: 3, color_ebc_max: 5 }),
      catalog("munich--brandA", "malt", "Мюнхенский", "Munich", { malt_type: "base", color_ebc_min: 15, color_ebc_max: 18 }),
      catalog("munich--brandB", "malt", "Мюнхенский", "Munich", { malt_type: "base", color_ebc_min: 16, color_ebc_max: 19 }),
      catalog("brandx--cascade", "hop", "Каскад", "Cascade", { alpha_acid_pct_typical: 6 }),
      catalog("chocolate--brandC", "malt", "Шоколадный", "Chocolate", { malt_type: "roasted-test-unique", color_ebc_min: 800, color_ebc_max: 900 }),
      catalog("fermentis--us-05", "yeast", "US-05", "US-05", { yeast_family: "US-05", form: "dry" })
    ];

    const lPilsner = line({ ingredientCatalogItemId: "beerex--pilsner", ingredientCategory: "fermentable", type: "malt", ingredientDisplayNameSnapshot: "Beerex Pilsner", amountNormalizedQuantity: 5000, amountNormalizedUnit: "g" });
    const lMunich = line({ ingredientCatalogItemId: "munich--brandA", ingredientCategory: "fermentable", type: "malt", ingredientDisplayNameSnapshot: "Munich BrandA", amountNormalizedQuantity: 2000, amountNormalizedUnit: "g" });
    const lCascade = line({ ingredientCatalogItemId: "brandx--cascade", ingredientCategory: "hop", type: "hop", ingredientDisplayNameSnapshot: "Cascade BrandX", amountNormalizedQuantity: 50, amountNormalizedUnit: "g" });
    const lChocolate = line({ ingredientCatalogItemId: "chocolate--brandC", ingredientCategory: "fermentable", type: "malt", ingredientDisplayNameSnapshot: "Chocolate BrandC", amountNormalizedQuantity: 200, amountNormalizedUnit: "g" });
    const lYeast = line({ ingredientCatalogItemId: "fermentis--us-05", ingredientCategory: "yeast", type: "yeast", ingredientDisplayNameSnapshot: "US-05", amountNormalizedQuantity: 1, amountNormalizedUnit: "pack" });
    mockState.lines = [lPilsner, lMunich, lCascade, lChocolate, lYeast];

    const munichShort = shelfItem({ ingredientCatalogItemId: "munich--brandA", normalizedQuantity: 500, normalizedUnit: "g", ingredientDisplayNameSnapshot: "Munich BrandA (складская)" });
    const munichSub = shelfItem({ ingredientCatalogItemId: "munich--brandB", normalizedQuantity: 5000, normalizedUnit: "g", ingredientDisplayNameSnapshot: "Munich BrandB (складская)" });
    const pilsnerSub = shelfItem({ ingredientCatalogItemId: "kursk--pilsner", normalizedQuantity: 6000, normalizedUnit: "g", ingredientDisplayNameSnapshot: "Курский пилс (складская)" });
    const cascadeExact = shelfItem({ ingredientCatalogItemId: "brandx--cascade", normalizedQuantity: 200, normalizedUnit: "g", ingredientDisplayNameSnapshot: "Cascade BrandX (складская)" });
    mockState.inventory = [munichShort, munichSub, pilsnerSub, cascadeExact];

    mockState.enrichedInventory = [
      enrichedItem(munichShort, { category: "fermentable", type: "malt", displayName: "Munich", technicalData: { type: "malt", maltType: "base", colorEbcMin: 15, colorEbcMax: 18 } }),
      enrichedItem(munichSub, { category: "fermentable", type: "malt", displayName: "Munich", technicalData: { type: "malt", maltType: "base", colorEbcMin: 16, colorEbcMax: 19 } }),
      enrichedItem(pilsnerSub, { category: "fermentable", type: "malt", displayName: "Pilsner", technicalData: { type: "malt", maltType: "base", colorEbcMin: 3, colorEbcMax: 5 } }),
      enrichedItem(cascadeExact, { category: "hop", type: "hop", displayName: "Cascade", technicalData: { type: "hop", alphaAcidPctTypical: 6 } })
    ];

    mockState.brewBatches = [makeBatch(uuid(500))];

    const plan = await previewBrewBatchConsumption(USER_ID, uuid(500));

    expect(plan).not.toBeNull();
    expect(plan!.alreadyConsumed).toBe(false);
    expect(plan!.lines).toHaveLength(5);

    const byId = new Map(plan!.lines.map((planLine) => [planLine.recipeIngredientId, planLine]));

    const pilsnerLine = byId.get(lPilsner.id)!;
    expect(pilsnerLine.kind).toBe("substitute_available");
    expect(pilsnerLine.exact).toBeNull();
    expect(pilsnerLine.substitutes.map((s) => s.inventoryItemId)).toEqual([pilsnerSub.id]);
    expect(pilsnerLine.substitutes[0]!.isShort).toBe(false);

    const munichLine = byId.get(lMunich.id)!;
    expect(munichLine.kind).toBe("exact_short");
    expect(munichLine.exact?.inventoryItemId).toBe(munichShort.id);
    expect(munichLine.exact?.isShort).toBe(true);
    expect(munichLine.substitutes.map((s) => s.inventoryItemId)).toContain(munichSub.id);
    // Ф1: солод — НЕ presence-based, короткий exact НЕ клампится (сервер уронит
    // всю транзакцию, если замену не отметить).
    expect(munichLine.exactClamps).toBe(false);
    expect(munichLine.requiredQuantityNormalized).toBe(2000);

    const cascadeLine = byId.get(lCascade.id)!;
    expect(cascadeLine.kind).toBe("exact");
    expect(cascadeLine.exact?.inventoryItemId).toBe(cascadeExact.id);
    expect(cascadeLine.exact?.isShort).toBe(false);
    expect(cascadeLine.exactClamps).toBe(false);

    const chocolateLine = byId.get(lChocolate.id)!;
    expect(chocolateLine.kind).toBe("missing");
    expect(chocolateLine.substitutes).toEqual([]);
    expect(chocolateLine.catalogSearchHref).toBe("/catalog/system/chocolate--brandC");

    const yeastLine = byId.get(lYeast.id)!;
    expect(yeastLine.kind).toBe("missing");
    expect(yeastLine.substitutes).toEqual([]);
    expect(yeastLine.catalogSearchHref).toBe("/catalog/system/fermentis--us-05");
    // Ф1: дрожжи — presence-based, exactClamps=true независимо от kind (здесь
    // "missing", потому что подходящего лота на складе нет вовсе).
    expect(yeastLine.exactClamps).toBe(true);

    expect(plan!.exactCount).toBe(2);
    expect(plan!.substituteOnlyCount).toBe(1);
    expect(plan!.missingCount).toBe(2);
  });
});

describe("previewBrewBatchConsumption — exactClamps на короткой exact-строке дрожжей", () => {
  it("дрожжи с недостаточным остатком лота — kind=exact_short, exactClamps=true", async () => {
    mockState.catalogItems = [
      catalog("fermentis--us-05", "yeast", "US-05", "US-05", { yeast_family: "US-05", form: "dry" })
    ];
    const lYeast = line({ ingredientCatalogItemId: "fermentis--us-05", ingredientCategory: "yeast", type: "yeast", ingredientDisplayNameSnapshot: "US-05", amountNormalizedQuantity: 2, amountNormalizedUnit: "pack" });
    mockState.lines = [lYeast];

    const yeastShort = shelfItem({ ingredientCatalogItemId: "fermentis--us-05", normalizedQuantity: 1, normalizedUnit: "pack", ingredientDisplayNameSnapshot: "US-05 (складская)" });
    mockState.inventory = [yeastShort];
    mockState.enrichedInventory = [
      enrichedItem(yeastShort, { category: "yeast", type: "yeast", displayName: "US-05" })
    ];

    mockState.brewBatches = [makeBatch(uuid(510))];

    const plan = await previewBrewBatchConsumption(USER_ID, uuid(510));
    const yeastLine = plan!.lines[0]!;
    expect(yeastLine.kind).toBe("exact_short");
    expect(yeastLine.exactClamps).toBe(true);
    expect(yeastLine.exact?.inventoryItemId).toBe(yeastShort.id);
  });
});

describe("Ф2: превью уважает закреплённый лот (inventorySelectionMeta), а не лот с наибольшим остатком", () => {
  it("строка закреплена за меньшим лотом — превью показывает именно его и честный isShort", async () => {
    mockState.catalogItems = [
      catalog("beerex--pilsner", "malt", "Пилснер", "Pilsner", { malt_type: "base", color_ebc_min: 3, color_ebc_max: 4 })
    ];

    const pinnedSmallLot = shelfItem({ ingredientCatalogItemId: "beerex--pilsner", normalizedQuantity: 1000, normalizedUnit: "g", ingredientDisplayNameSnapshot: "Beerex Pilsner (маленький лот)" });
    const biggerLot = shelfItem({ ingredientCatalogItemId: "beerex--pilsner", normalizedQuantity: 6000, normalizedUnit: "g", ingredientDisplayNameSnapshot: "Beerex Pilsner (большой лот)" });
    mockState.inventory = [pinnedSmallLot, biggerLot];
    mockState.enrichedInventory = [
      enrichedItem(pinnedSmallLot, { category: "fermentable", type: "malt", displayName: "Beerex Pilsner" }),
      enrichedItem(biggerLot, { category: "fermentable", type: "malt", displayName: "Beerex Pilsner" })
    ];

    // Строка закреплена (inventorySelectionMeta) за МЕНЬШИМ лотом — тот же выбор,
    // что уважает resolveOwnedInventoryItemForRecipeLine у реального списания.
    const lPilsner = line({
      ingredientCatalogItemId: "beerex--pilsner",
      ingredientCategory: "fermentable",
      type: "malt",
      ingredientDisplayNameSnapshot: "Beerex Pilsner",
      amountNormalizedQuantity: 5000,
      amountNormalizedUnit: "g",
      inventorySelectionMeta: { inventoryItemId: pinnedSmallLot.id }
    });
    mockState.lines = [lPilsner];

    const batch = makeBatch(uuid(511));
    mockState.brewBatches = [batch];

    const plan = await previewBrewBatchConsumption(USER_ID, batch.id);
    const planLine = plan!.lines[0]!;
    // Без закрепления подобрался бы biggerLot (6000 г, хватает) — превью обязано
    // показать именно закреплённый маленький лот и честную нехватку.
    expect(planLine.kind).toBe("exact_short");
    expect(planLine.exact?.inventoryItemId).toBe(pinnedSmallLot.id);
    expect(planLine.exact?.isShort).toBe(true);

    // Реальное списание видит ту же картину — не роняет всю транзакцию молча по
    // другому лоту, а честно требует замену/пополнение (кламп здесь нелегален:
    // солод не presence-based).
    await expect(consumeBrewBatchInventory(USER_ID, batch.id)).rejects.toThrow("INSUFFICIENT_STOCK");
  });
});

describe("Ф1: замена на строке с коротким exact (exactClamps=false) списывает замену, а не кламп по exact", () => {
  it("короткий exact солода + утверждённая замена — списывает С ЗАМЕНЫ, exact-лот не трогает", async () => {
    mockState.catalogItems = [
      catalog("munich--brandA", "malt", "Мюнхенский", "Munich", { malt_type: "base", color_ebc_min: 15, color_ebc_max: 18 }),
      catalog("munich--brandB", "malt", "Мюнхенский", "Munich", { malt_type: "base", color_ebc_min: 16, color_ebc_max: 19 })
    ];
    const lMunich = line({ ingredientCatalogItemId: "munich--brandA", ingredientCategory: "fermentable", type: "malt", ingredientDisplayNameSnapshot: "Munich BrandA", amountNormalizedQuantity: 2000, amountNormalizedUnit: "g" });
    mockState.lines = [lMunich];

    const munichShort = shelfItem({ ingredientCatalogItemId: "munich--brandA", normalizedQuantity: 500, normalizedUnit: "g", ingredientDisplayNameSnapshot: "Munich BrandA (складская)" });
    const munichSub = shelfItem({ ingredientCatalogItemId: "munich--brandB", normalizedQuantity: 5000, normalizedUnit: "g", ingredientDisplayNameSnapshot: "Munich BrandB (складская)" });
    mockState.inventory = [munichShort, munichSub];
    mockState.enrichedInventory = [
      enrichedItem(munichShort, { category: "fermentable", type: "malt", displayName: "Munich", technicalData: { type: "malt", maltType: "base", colorEbcMin: 15, colorEbcMax: 18 } }),
      enrichedItem(munichSub, { category: "fermentable", type: "malt", displayName: "Munich", technicalData: { type: "malt", maltType: "base", colorEbcMin: 16, colorEbcMax: 19 } })
    ];

    const batch = makeBatch(uuid(512));
    mockState.brewBatches = [batch];

    // Предпросмотр подтверждает: короткий exact НЕ клампится, замена доступна.
    const plan = await previewBrewBatchConsumption(USER_ID, batch.id);
    const planLine = plan!.lines[0]!;
    expect(planLine.kind).toBe("exact_short");
    expect(planLine.exactClamps).toBe(false);
    expect(planLine.substitutes.map((s) => s.inventoryItemId)).toContain(munichSub.id);

    const result = await consumeBrewBatchInventory(USER_ID, batch.id, {
      substitutions: [{ recipeIngredientId: lMunich.id, inventoryItemId: munichSub.id }]
    });

    expect(result.consumed).toHaveLength(1);
    expect(result.consumed[0]!.inventoryItemId).toBe(munichSub.id);
    expect(result.consumed[0]!.quantityNormalized).toBe(2000);
    expect(result.consumed[0]!.substitutedFor).toBe("Munich BrandA");

    // Короткий exact-лот НЕ тронут — списание ушло в замену, а не в кламп по exact.
    const untouchedShort = mockState.inventory.find((item) => item.id === munichShort.id)!;
    expect(untouchedShort.normalizedQuantity).toBe(500);
  });
});

describe("consumeBrewBatchInventory — списание с утверждённой заменой", () => {
  it("списывает с позиции-замены, пишет транзакцию, восстанавливает на неё же; substitutedFor виден в виде", async () => {
    mockState.catalogItems = [
      catalog("beerex--pilsner", "malt", "Пилснер", "Pilsner", { malt_type: "base", color_ebc_min: 3, color_ebc_max: 4 }),
      catalog("kursk--pilsner", "malt", "Пилснер", "Pilsner", { malt_type: "base", color_ebc_min: 3, color_ebc_max: 5 })
    ];
    const lPilsner = line({ ingredientCatalogItemId: "beerex--pilsner", ingredientCategory: "fermentable", type: "malt", ingredientDisplayNameSnapshot: "Beerex Pilsner", amountNormalizedQuantity: 5000, amountNormalizedUnit: "g" });
    mockState.lines = [lPilsner];

    const pilsnerSub = shelfItem({ ingredientCatalogItemId: "kursk--pilsner", normalizedQuantity: 6000, normalizedUnit: "g", ingredientDisplayNameSnapshot: "Курский пилс (складская)" });
    mockState.inventory = [pilsnerSub];
    mockState.enrichedInventory = [
      enrichedItem(pilsnerSub, { category: "fermentable", type: "malt", displayName: "Pilsner" })
    ];

    const batch = makeBatch(uuid(501));
    mockState.brewBatches = [batch];

    const result = await consumeBrewBatchInventory(USER_ID, batch.id, {
      substitutions: [{ recipeIngredientId: lPilsner.id, inventoryItemId: pilsnerSub.id }]
    });

    expect(result.hasConsumed).toBe(true);
    expect(result.consumed).toHaveLength(1);
    expect(result.consumed[0]!.inventoryItemId).toBe(pilsnerSub.id);
    expect(result.consumed[0]!.quantityNormalized).toBe(5000);
    expect(result.consumed[0]!.substitutedFor).toBe("Beerex Pilsner");

    const updatedShelfItem = mockState.inventory.find((item) => item.id === pilsnerSub.id)!;
    expect(updatedShelfItem.normalizedQuantity).toBe(1000);

    const transaction = mockState.transactions.find((txn) => txn.inventoryItemId === pilsnerSub.id && txn.type === "consume");
    expect(transaction).toBeTruthy();
    expect(transaction!.quantityDeltaNormalized).toBe(-5000);

    const { view, restoredItemCount } = await restoreBrewBatchInventory(USER_ID, batch.id);
    expect(restoredItemCount).toBe(1);
    expect(view.consumed).toEqual([]);
    const restoredShelfItem = mockState.inventory.find((item) => item.id === pilsnerSub.id)!;
    expect(restoredShelfItem.normalizedQuantity).toBe(6000);
  });
});

describe("consumeBrewBatchInventory — валидация замен на сервере", () => {
  it("отклоняет позицию склада другого пользователя", async () => {
    mockState.catalogItems = [
      catalog("beerex--pilsner", "malt", "Пилснер", "Pilsner", { malt_type: "base", color_ebc_min: 3, color_ebc_max: 4 }),
      catalog("kursk--pilsner", "malt", "Пилснер", "Pilsner", { malt_type: "base", color_ebc_min: 3, color_ebc_max: 5 })
    ];
    const lPilsner = line({ ingredientCatalogItemId: "beerex--pilsner", ingredientCategory: "fermentable", type: "malt", ingredientDisplayNameSnapshot: "Beerex Pilsner", amountNormalizedQuantity: 5000, amountNormalizedUnit: "g" });
    mockState.lines = [lPilsner];

    // Позиция ЧУЖАЯ (userId = OTHER_USER_ID) — listInventoryForUser(USER_ID) её не
    // отдаёт вовсе, поэтому в кандидатах строки её нет никогда.
    const foreignItem = shelfItem({ userId: OTHER_USER_ID, ingredientCatalogItemId: "kursk--pilsner", normalizedQuantity: 9000, normalizedUnit: "g" });
    mockState.inventory = [foreignItem];
    mockState.enrichedInventory = [
      enrichedItem(foreignItem, { category: "fermentable", type: "malt", displayName: "Pilsner", ownerId: OTHER_USER_ID })
    ];

    const batch = makeBatch(uuid(502));
    mockState.brewBatches = [batch];

    await expect(consumeBrewBatchInventory(USER_ID, batch.id, {
      substitutions: [{ recipeIngredientId: lPilsner.id, inventoryItemId: foreignItem.id }]
    })).rejects.toThrow("INVALID_SUBSTITUTION");

    expect(mockState.transactions).toHaveLength(0);
  });

  it("отклоняет позицию из другой группы", async () => {
    mockState.catalogItems = [
      catalog("beerex--pilsner", "malt", "Пилснер", "Pilsner", { malt_type: "base", color_ebc_min: 3, color_ebc_max: 4 }),
      catalog("brandx--cascade", "hop", "Каскад", "Cascade", { alpha_acid_pct_typical: 6 })
    ];
    const lPilsner = line({ ingredientCatalogItemId: "beerex--pilsner", ingredientCategory: "fermentable", type: "malt", ingredientDisplayNameSnapshot: "Beerex Pilsner", amountNormalizedQuantity: 5000, amountNormalizedUnit: "g" });
    mockState.lines = [lPilsner];

    // Хмель того же пользователя — другая категория/группа, не кандидат для солода.
    const hopItem = shelfItem({ ingredientCatalogItemId: "brandx--cascade", normalizedQuantity: 500, normalizedUnit: "g" });
    mockState.inventory = [hopItem];
    mockState.enrichedInventory = [
      enrichedItem(hopItem, { category: "hop", type: "hop", displayName: "Cascade" })
    ];

    const batch = makeBatch(uuid(503));
    mockState.brewBatches = [batch];

    await expect(consumeBrewBatchInventory(USER_ID, batch.id, {
      substitutions: [{ recipeIngredientId: lPilsner.id, inventoryItemId: hopItem.id }]
    })).rejects.toThrow("INVALID_SUBSTITUTION");

    expect(mockState.transactions).toHaveLength(0);
  });

  it("отклоняет замену для дрожжевой строки (exact_only)", async () => {
    mockState.catalogItems = [
      catalog("fermentis--us-05", "yeast", "US-05", "US-05", { yeast_family: "US-05", form: "dry" }),
      catalog("lallemand--other", "yeast", "BRY-97", "BRY-97", { yeast_family: "BRY-97", form: "dry" })
    ];
    const lYeast = line({ ingredientCatalogItemId: "fermentis--us-05", ingredientCategory: "yeast", type: "yeast", ingredientDisplayNameSnapshot: "US-05", amountNormalizedQuantity: 1, amountNormalizedUnit: "pack" });
    mockState.lines = [lYeast];

    // Другой штамм на складе — presence-based замены у дрожжей не бывает вовсе.
    const otherYeast = shelfItem({ ingredientCatalogItemId: "lallemand--other", normalizedQuantity: 3, normalizedUnit: "pack" });
    mockState.inventory = [otherYeast];
    mockState.enrichedInventory = [
      enrichedItem(otherYeast, { category: "yeast", type: "yeast", displayName: "BRY-97" })
    ];

    const batch = makeBatch(uuid(504));
    mockState.brewBatches = [batch];

    await expect(consumeBrewBatchInventory(USER_ID, batch.id, {
      substitutions: [{ recipeIngredientId: lYeast.id, inventoryItemId: otherYeast.id }]
    })).rejects.toThrow("INVALID_SUBSTITUTION");

    expect(mockState.transactions).toHaveLength(0);
  });
});

describe("consumeBrewBatchInventory — недостаточно остатка у замены", () => {
  it("бросает INSUFFICIENT_STOCK, когда утверждённая замена сама короче требуемого (не-дрожжи)", async () => {
    mockState.catalogItems = [
      catalog("munich--brandA", "malt", "Мюнхенский", "Munich", { malt_type: "base", color_ebc_min: 15, color_ebc_max: 18 }),
      catalog("munich--brandB", "malt", "Мюнхенский", "Munich", { malt_type: "base", color_ebc_min: 16, color_ebc_max: 19 })
    ];
    const lMunich = line({ ingredientCatalogItemId: "munich--brandA", ingredientCategory: "fermentable", type: "malt", ingredientDisplayNameSnapshot: "Munich BrandA", amountNormalizedQuantity: 2000, amountNormalizedUnit: "g" });
    mockState.lines = [lMunich];

    // Ни экзакт-позиции нет вовсе, ни замена не набирает нужного объёма (1000 < 2000).
    const shortSub = shelfItem({ ingredientCatalogItemId: "munich--brandB", normalizedQuantity: 1000, normalizedUnit: "g" });
    mockState.inventory = [shortSub];
    mockState.enrichedInventory = [
      enrichedItem(shortSub, { category: "fermentable", type: "malt", displayName: "Munich" })
    ];

    const batch = makeBatch(uuid(505));
    mockState.brewBatches = [batch];

    await expect(consumeBrewBatchInventory(USER_ID, batch.id, {
      substitutions: [{ recipeIngredientId: lMunich.id, inventoryItemId: shortSub.id }]
    })).rejects.toThrow("INSUFFICIENT_STOCK");
  });
});
