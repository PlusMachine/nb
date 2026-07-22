import { beforeEach, describe, expect, it, vi } from "vitest";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

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
    inventoryTransactions: { name: "inventory_transactions", id: "id" },
    userIngredients: {
      name: "user_ingredients",
      id: "id",
      userId: "userId",
      ingredientCatalogItemId: "ingredientCatalogItemId",
      userCustomIngredientId: "userCustomIngredientId",
      // Проекция блокирующего чтения остатка (SELECT … FOR UPDATE в consume).
      normalizedQuantity: "normalizedQuantity",
      normalizedUnit: "normalizedUnit",
      enteredQuantity: "enteredQuantity",
      enteredUnit: "enteredUnit",
      packageVariantId: "packageVariantId"
    },
    brewBatches: { name: "brew_batches", id: "id", userId: "userId", status: "status" },
    // Источники эквивалента пачки: движок ходит сюда ТОЛЬКО когда единица строки
    // рецепта разошлась с единицей складской позиции (pack vs g).
    ingredients: { name: "ingredients", id: "id" },
    userCustomIngredients: { name: "user_custom_ingredients", id: "id" },
    ingredientPackageVariants: { name: "ingredient_package_variants", id: "id" }
  },
  mockState: {
    idCounter: 0,
    recipes: [] as any[],
    lines: [] as any[],
    inventory: [] as any[],
    allocations: [] as any[],
    transactions: [] as any[],
    brewBatches: [] as any[],
    catalogItems: [] as any[],
    customIngredients: [] as any[],
    packageVariants: [] as any[]
  }
}));

vi.mock("@nb/db", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
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

  // isNull(col) → маркер `null:<col>` в плоском where. Нужен для области аллокаций
  // (brewBatchId IS NULL = «вне партии»), иначе мок молча игнорировал бы фильтр и
  // тест не отличал бы аллокации разных партий.
  const hasIsNull = (where: any, key: string): boolean => {
    const items = Array.isArray(where) ? where.flat(8) : [where];
    return items.includes(`null:${key}`);
  };

  // Область партии в where: точная партия (eq), «вне партии» (isNull) или нет
  // фильтра вовсе. Возвращает предикат по строке аллокации.
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
    return [];
  };

  // db.select({...}).from(t).where(...).for("update") — блокирующее чтение остатка
  // в consume. Мок блокировок не эмулирует (гонку проверяем на уровне «условный
  // UPDATE забрал строку / не забрал»), но обязан отдавать СВЕЖИЕ значения строки:
  // на этом держится и кламп, и quantityBefore в журнале.
  const select = (projection: Record<string, string>) => {
    const state: { table: string | null; where: any } = { table: null, where: null };
    const resolve = () => {
      const id = getEqValue(state.where, "id");
      const userId = getEqValue(state.where, "userId");
      return tableRows(state.table ?? "")
        .filter((row) => (id === undefined || row.id === id) && (userId === undefined || row.userId === userId))
        .map((row) => {
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
          const authorId = getEqValue(arg?.where, "authorId");
          // ensureBrewableRecipe фильтрует только по id (доступ = свой/published);
          // ensureOwnedRecipe — по id+authorId. Поддерживаем оба.
          return mockState.recipes.find(
            (recipe) => recipe.id === id && (authorId === undefined || recipe.authorId === authorId)
          ) ?? null;
        }
      },
      recipeIngredients: {
        findMany: async (arg: any) => {
          const recipeId = getEqValue(arg?.where, "recipeId");
          return mockState.lines.filter((line) => line.recipeId === recipeId);
        },
        findFirst: async (arg: any) => {
          const recipeId = getEqValue(arg?.where, "recipeId");
          const persistentKey = getEqValue(arg?.where, "persistentKey");
          return mockState.lines.find((line) => line.recipeId === recipeId && line.persistentKey === persistentKey) ?? null;
        }
      },
      recipeInventoryAllocations: {
        findMany: async (arg: any) => {
          const userId = getEqValue(arg?.where, "userId");
          const recipeId = getEqValue(arg?.where, "recipeId");
          const status = getEqValue(arg?.where, "status");
          const statuses = getInArrayValue(arg?.where, "status");
          const inScope = batchScopeMatcher(arg?.where);
          return mockState.allocations.filter((allocation) => (
            allocation.userId === userId
            // hasConsumedAllocationsForBatch ищет по партии, без recipeId.
            && (recipeId === undefined || allocation.recipeId === recipeId)
            && inScope(allocation)
            && (status === undefined || allocation.status === status)
            && (!statuses || statuses.includes(allocation.status))
          ));
        }
      },
      userIngredients: {
        findMany: async (arg: any) => {
          const userId = getEqValue(arg?.where, "userId");
          const ids = getInArrayValue(arg?.where, "id");
          return mockState.inventory.filter((item) => (
            item.userId === userId
            && (!ids || ids.includes(item.id))
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
          const ids = getInArrayValue(arg?.where, "id");
          return mockState.brewBatches.filter((batch) => !ids || ids.includes(batch.id));
        }
      },
      ingredients: {
        findFirst: async (arg: any) => {
          const id = getEqValue(arg?.where, "id");
          return mockState.catalogItems.find((item) => item.id === id) ?? null;
        },
        // Дожим засыпи под эффективность спрашивает техданные каталога пачкой:
        // без них движок не отличит солод (эффективность действует) от сахара.
        findMany: async (arg: any) => {
          const ids = getInArrayValue(arg?.where, "id");
          return mockState.catalogItems.filter((item) => !ids || ids.includes(item.id));
        }
      },
      userCustomIngredients: {
        findFirst: async (arg: any) => {
          const id = getEqValue(arg?.where, "id");
          return mockState.customIngredients.find((item) => item.id === id) ?? null;
        }
      },
      ingredientPackageVariants: {
        findFirst: async (arg: any) => {
          const id = getEqValue(arg?.where, "id");
          return mockState.packageVariants.find((variant) => variant.id === id) ?? null;
        }
      }
    },
    insert: (table: { name: string }) => ({
      values: (values: any) => {
        if (table.name === "recipe_inventory_allocations") {
          mockState.allocations.push({
            ...values,
            id: uuid(++mockState.idCounter),
            allocatedAt: now,
            createdAt: now,
            updatedAt: now
          });
        }

        if (table.name === "inventory_transactions") {
          mockState.transactions.push({
            ...values,
            id: uuid(++mockState.idCounter),
            createdAt: now
          });
        }

        return { returning: async () => [values] };
      }
    }),
    update: (table: { name: string }) => ({
      set: (set: any) => ({
        where: (where: any) => {
          // Список реально обновлённых строк: на нём держится «заявка» consume
          // (условный UPDATE по статусу забрал строку → склад трогаем, не забрал →
          // конкурент уже списал). Пустой returning раньше делал этот тест слепым.
          const updated: any[] = [];

          if (table.name === "recipe_inventory_allocations") {
            const id = getEqValue(where, "id");
            // Гашение дублей аллокаций адресуется списком id (inArray) — без этого
            // фильтра фейк «релизил» вообще все активные аллокации пользователя.
            const ids = getInArrayValue(where, "id");
            const userId = getEqValue(where, "userId");
            const recipeId = getEqValue(where, "recipeId");
            const lineId = getEqValue(where, "recipeIngredientId");
            const status = getEqValue(where, "status");
            const statuses = getInArrayValue(where, "status");
            // Область партии в UPDATE обязательна: release прежней аллокации строки
            // не должен трогать активную аллокацию соседней варки того же рецепта.
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
    transaction: async (callback: (tx: any) => Promise<void>) => callback(db)
  };

  return {
    db,
    and: (...args: unknown[]) => args,
    eq: (...args: unknown[]) => args,
    inArray: (column: string, values: string[]) => [`in:${column}`, values],
    isNull: (column: string) => [`null:${column}`],
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

// inventory-service.ts тянет listInventoryForUser (Ф2: buildBrewBatchConsumeLinePlanEntries)
// — та цепочка в проде доходит до features/system/currency-rates.ts ("server-only",
// падает вне Next.js рантайма). Этот файл замены не тестирует (см.
// coverage-brew-batch-consume-substitution.test.ts) — здесь достаточно заглушки,
// чтобы модуль резолвился.
vi.mock("../features/inventory/service", () => ({ listInventoryForUser: vi.fn(async () => []) }));

import {
  autoAllocateRecipeInventoryFromStock,
  consumeRecipeInventoryAllocations,
  hasConsumedAllocationsForBatch,
  listRecipeStockCoverage
} from "../features/recipes/inventory-service";

describe("recipe inventory allocation service", () => {
  beforeEach(() => {
    mockState.idCounter = 0;
    mockState.brewBatches = [];
    mockState.catalogItems = [];
    mockState.customIngredients = [];
    mockState.packageVariants = [];
    mockState.recipes = [{
      id: uuid(1),
      authorId: uuid(2),
      title: "Recipe",
      publicationState: "draft",
      // Объём рецепта — база пересчёта под объём партии (20 л).
      batchSizeNormalizedQuantity: 20000,
      batchSizeNormalizedUnit: "ml"
    }];
    mockState.lines = [{
      id: uuid(11),
      recipeId: uuid(1),
      persistentKey: uuid(111),
      displayOrder: 0,
      ingredientCatalogItemId: "hop-cascade",
      userCustomIngredientId: null,
      ingredientDisplayNameSnapshot: "Cascade",
      amountNormalizedQuantity: 50,
      amountNormalizedUnit: "g",
      inventoryIntentMode: "use_stock",
      inventorySelectionMeta: { inventoryItemId: uuid(21) }
    }];
    mockState.inventory = [{
      id: uuid(21),
      userId: uuid(2),
      ingredientCatalogItemId: "hop-cascade",
      userCustomIngredientId: null,
      ingredientDisplayNameSnapshot: "Cascade stock",
      normalizedQuantity: 100,
      normalizedUnit: "g",
      enteredQuantity: 100,
      enteredUnit: "g",
      archivedAt: null,
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    }];
    mockState.allocations = [];
    mockState.transactions = [];
  });

  // Подбор склада под строки рецепта живёт только в autoAllocate (редакторский
  // syncRecipeSelectedInventoryAllocations снесён вместе с кнопкой «Обновить наличие»:
  // autoAllocate — его надмножество, тоже уважает лот из inventorySelectionMeta).
  it("подбирает выбранные складские позиции, не списывая склад", async () => {
    const coverage = await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1));

    expect(mockState.allocations).toHaveLength(1);
    expect(mockState.inventory[0].normalizedQuantity).toBe(100);
    expect(coverage.lines[0]).toMatchObject({
      inventoryItemId: uuid(21),
      status: "covered",
      requiredQuantityNormalized: 50
    });
  });

  it("restores a stale selected inventory id from the recipe source linkage", async () => {
    mockState.lines[0].inventorySelectionMeta = { inventoryItemId: uuid(99) };

    const coverage = await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1));

    expect(mockState.allocations).toHaveLength(1);
    expect(mockState.lines[0].inventorySelectionMeta).toMatchObject({
      inventoryItemId: uuid(21),
      stockNormalizedQuantity: 100,
      stockNormalizedUnit: "g"
    });
    expect(coverage.lines[0]).toMatchObject({
      inventoryItemId: uuid(21),
      status: "covered"
    });
  });

  it("skips stale stock selections without aborting coverage for other lines", async () => {
    mockState.lines = [
      {
        ...mockState.lines[0],
        id: uuid(11),
        persistentKey: uuid(111),
        ingredientCatalogItemId: "missing-malt",
        ingredientDisplayNameSnapshot: "Missing malt",
        inventorySelectionMeta: { inventoryItemId: uuid(99) }
      },
      {
        ...mockState.lines[0],
        id: uuid(12),
        persistentKey: uuid(112),
        displayOrder: 1,
        inventorySelectionMeta: { inventoryItemId: uuid(21) }
      }
    ];

    const coverage = await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1));

    expect(mockState.allocations).toHaveLength(1);
    expect(coverage.summary).toMatchObject({
      totalLines: 2,
      selectedLines: 1
    });
    expect(coverage.lines[0]).toMatchObject({
      status: "unselected",
      inventoryItemId: null
    });
    expect(coverage.lines[1]).toMatchObject({
      status: "covered",
      inventoryItemId: uuid(21)
    });
  });

  it("confirmed consume writes inventory transactions and reduces normalized stock", async () => {
    await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1));
    const coverage = await consumeRecipeInventoryAllocations(uuid(2), uuid(1));

    expect(mockState.inventory[0]).toMatchObject({
      normalizedQuantity: 50,
      enteredQuantity: 50
    });
    expect(mockState.transactions[0]).toMatchObject({
      type: "consume",
      quantityDeltaNormalized: -50,
      quantityBeforeNormalized: 100,
      quantityAfterNormalized: 50
    });
    expect(coverage.lines[0]?.status).toBe("consumed");
  });

  it("rejects consume when stock is short", async () => {
    mockState.inventory[0].normalizedQuantity = 20;
    mockState.inventory[0].enteredQuantity = 20;
    await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1));

    await expect(consumeRecipeInventoryAllocations(uuid(2), uuid(1))).rejects.toThrow("INSUFFICIENT_STOCK");
  });

  it("lists unselected lines as missing stock coverage", async () => {
    mockState.lines[0].inventoryIntentMode = "catalog";
    mockState.lines[0].inventorySelectionMeta = null;

    const coverage = await listRecipeStockCoverage(uuid(2), uuid(1));

    expect(coverage.summary).toMatchObject({
      totalLines: 1,
      selectedLines: 0,
      shortLines: 0
    });
    expect(coverage.lines[0]?.status).toBe("unselected");
  });

  // Дефект A7: защита от двойного списания жила ПО РЕЦЕПТУ, и вторая варка того же
  // рецепта (пока первая ещё активна) молча не получала ни одной аллокации — склад
  // не списывался вовсе. Аллокация принадлежит ПАРТИИ: блокирует только своя партия.
  describe("область аллокаций = партия", () => {
    const FIRST_BATCH = uuid(301);
    const SECOND_BATCH = uuid(302);

    const seedConsumedAllocation = (brewBatchId: string | null) => {
      mockState.allocations = [{
        id: uuid(201),
        userId: uuid(2),
        recipeId: uuid(1),
        recipeIngredientId: uuid(11),
        recipeIngredientPersistentKey: uuid(111),
        inventoryItemId: uuid(21),
        status: "consumed",
        brewBatchId,
        allocatedQuantityNormalized: 50,
        allocatedNormalizedUnit: "g",
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
      }];
    };

    it("hasConsumedAllocationsForBatch: true для своей партии, false для соседней", async () => {
      seedConsumedAllocation(FIRST_BATCH);

      expect(await hasConsumedAllocationsForBatch(uuid(2), FIRST_BATCH)).toBe(true);
      expect(await hasConsumedAllocationsForBatch(uuid(2), SECOND_BATCH)).toBe(false);
    });

    it("consumed-аллокация ДРУГОЙ партии не мешает подбору: вторая варка получает свою аллокацию", async () => {
      // Первая варка уже списала 50 г — на складе осталось 50 г.
      seedConsumedAllocation(FIRST_BATCH);
      mockState.inventory[0].normalizedQuantity = 50;
      mockState.inventory[0].enteredQuantity = 50;

      const coverage = await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: SECOND_BATCH });

      const own = mockState.allocations.filter((a) => a.brewBatchId === SECOND_BATCH);
      expect(own).toHaveLength(1);
      expect(own[0]).toMatchObject({ status: "allocated", inventoryItemId: uuid(21) });
      expect(coverage.lines[0]).toMatchObject({ status: "covered", inventoryItemId: uuid(21) });
    });

    it("две партии одного рецепта: обе списывают свой склад", async () => {
      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: FIRST_BATCH });
      await consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: FIRST_BATCH });
      expect(mockState.inventory[0].normalizedQuantity).toBe(50);

      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: SECOND_BATCH });
      await consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: SECOND_BATCH });

      // Каждая варка взяла свои 50 г из ТЕКУЩЕГО остатка: 100 → 50 → 0.
      expect(mockState.inventory[0].normalizedQuantity).toBe(0);
      expect(mockState.transactions).toHaveLength(2);
      expect(mockState.transactions.map((t) => t.brewBatchId)).toEqual([FIRST_BATCH, SECOND_BATCH]);
      expect(mockState.allocations.filter((a) => a.status === "consumed")).toHaveLength(2);
    });

    it("повторное списание одной партии не списывает дважды", async () => {
      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: FIRST_BATCH });
      await consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: FIRST_BATCH });

      // Повтор всего цикла (двойной клик/ретрай) — склад не трогаем второй раз.
      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: FIRST_BATCH });
      await consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: FIRST_BATCH });

      expect(mockState.inventory[0].normalizedQuantity).toBe(50);
      expect(mockState.transactions).toHaveLength(1);
      expect(mockState.allocations.filter((a) => a.brewBatchId === FIRST_BATCH)).toHaveLength(1);
    });

    it("подбор второй партии не гасит активную аллокацию первой", async () => {
      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: FIRST_BATCH });
      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: SECOND_BATCH });

      const active = mockState.allocations.filter((a) => a.status === "allocated");
      expect(active).toHaveLength(2);
      expect(active.map((a) => a.brewBatchId).sort()).toEqual([FIRST_BATCH, SECOND_BATCH].sort());
    });

    it("списание партии не трогает аллокации соседней партии", async () => {
      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: FIRST_BATCH });
      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: SECOND_BATCH });

      await consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: FIRST_BATCH });

      expect(mockState.transactions).toHaveLength(1);
      expect(mockState.allocations.find((a) => a.brewBatchId === FIRST_BATCH)?.status).toBe("consumed");
      expect(mockState.allocations.find((a) => a.brewBatchId === SECOND_BATCH)?.status).toBe("allocated");
    });

    it("legacy consumed-аллокация без партии (NULL) не блокирует списание партии", async () => {
      seedConsumedAllocation(null);
      mockState.inventory[0].normalizedQuantity = 50;
      mockState.inventory[0].enteredQuantity = 50;

      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: FIRST_BATCH });
      await consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: FIRST_BATCH });

      expect(mockState.inventory[0].normalizedQuantity).toBe(0);
      expect(mockState.transactions).toHaveLength(1);
    });

    it("listRecipeStockCoverage показывает покрытие своей партии, а не соседней", async () => {
      seedConsumedAllocation(FIRST_BATCH);

      const own = await listRecipeStockCoverage(uuid(2), uuid(1), { brewBatchId: FIRST_BATCH });
      expect(own.lines[0]).toMatchObject({ status: "consumed", allocationId: uuid(201) });

      // У соседней партии по этой строке ещё ничего нет — «не выбрано», а не «списано».
      const neighbour = await listRecipeStockCoverage(uuid(2), uuid(1), { brewBatchId: SECOND_BATCH });
      expect(neighbour.lines[0]).toMatchObject({ status: "unselected", allocationId: null });
    });
  });

  // Склад раскрывает пачку при записи (1 pack → 11 г, normalized_unit='g'), рецепт
  // хранит «пачку» как есть. Подбор позиции требовал строгого равенства единиц —
  // и дрожжи не списывались НИКОГДА (молча, без ошибки). Теперь требование строки
  // конвертируется в единицу складской позиции, а аллокация живёт в ней же.
  describe("дрожжи: пачка рецепта против граммов склада", () => {
    const yeastLine = (overrides: Record<string, unknown> = {}) => ({
      id: uuid(31),
      recipeId: uuid(1),
      persistentKey: uuid(131),
      displayOrder: 0,
      ingredientCatalogItemId: "fermentis-us-05",
      userCustomIngredientId: null,
      ingredientDisplayNameSnapshot: "US-05",
      ingredientCategory: "yeast",
      type: "yeast",
      amountNormalizedQuantity: 1,
      amountNormalizedUnit: "pack",
      inventoryIntentMode: "use_stock",
      inventorySelectionMeta: null,
      ...overrides
    });

    const yeastStock = (overrides: Record<string, unknown> = {}) => ({
      id: uuid(41),
      userId: uuid(2),
      ingredientCatalogItemId: "fermentis-us-05",
      userCustomIngredientId: null,
      packageVariantId: null,
      ingredientDisplayNameSnapshot: "US-05 (склад)",
      // 2 пачки, раскрытые складом в граммы
      normalizedQuantity: 22,
      normalizedUnit: "g",
      enteredQuantity: 2,
      enteredUnit: "pack",
      archivedAt: null,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      ...overrides
    });

    const dryYeastCatalogItem = (attributes: Record<string, unknown> = { form: "dry" }) => ({
      id: "fermentis-us-05",
      type: "yeast",
      attributes
    });

    beforeEach(() => {
      mockState.lines = [yeastLine()];
      mockState.inventory = [yeastStock()];
      mockState.catalogItems = [dryYeastCatalogItem()];
    });

    it("подбирает позицию и пишет аллокацию в единице склада (1 пачка → 11 г)", async () => {
      const coverage = await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1));

      expect(mockState.allocations).toHaveLength(1);
      expect(mockState.allocations[0]).toMatchObject({
        allocatedQuantityNormalized: 11,
        allocatedNormalizedUnit: "g",
        inventoryItemId: uuid(41)
      });
      // След конверсии остаётся в мете аллокации.
      expect(mockState.allocations[0].allocationMeta).toMatchObject({
        sourceNormalizedQuantity: 1,
        sourceNormalizedUnit: "pack"
      });
      expect(coverage.lines[0]).toMatchObject({
        status: "covered",
        requiredQuantityNormalized: 11,
        requiredNormalizedUnit: "g",
        availableQuantityNormalized: 22
      });
    });

    it("списывает 11 г и чинит entered_quantity в пачках", async () => {
      mockState.brewBatches = [{ id: uuid(301), status: "brewing" }];

      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: uuid(301) });
      const coverage = await consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: uuid(301) });

      expect(mockState.inventory[0]).toMatchObject({
        normalizedQuantity: 11,
        enteredQuantity: 1,
        enteredUnit: "pack"
      });
      expect(mockState.transactions).toHaveLength(1);
      expect(mockState.transactions[0]).toMatchObject({
        type: "consume",
        quantityDeltaNormalized: -11,
        normalizedUnit: "g",
        quantityBeforeNormalized: 22,
        quantityAfterNormalized: 11,
        brewBatchId: uuid(301)
      });
      expect(coverage.lines[0]?.status).toBe("consumed");
    });

    it("package_size из каталога бьёт фолбэк 11 г", async () => {
      mockState.catalogItems = [dryYeastCatalogItem({ form: "dry", package_size: 15, package_unit: "g" })];

      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1));

      expect(mockState.allocations[0]).toMatchObject({
        allocatedQuantityNormalized: 15,
        allocatedNormalizedUnit: "g"
      });
    });

    it("жидкие дрожжи: пачка → миллилитры", async () => {
      mockState.catalogItems = [dryYeastCatalogItem({ form: "liquid", package_size: 35, package_unit: "ml" })];
      mockState.inventory = [yeastStock({ normalizedQuantity: 70, normalizedUnit: "ml", enteredQuantity: 2 })];

      const coverage = await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1));

      expect(mockState.allocations[0]).toMatchObject({
        allocatedQuantityNormalized: 35,
        allocatedNormalizedUnit: "ml"
      });
      expect(coverage.lines[0]?.status).toBe("covered");
    });

    it("вариант фасовки (6 шт в пачке, единица 'pcs') раскрывается в штуки", async () => {
      mockState.lines = [yeastLine({
        ingredientCatalogItemId: "whirlfloc",
        ingredientCategory: "consumable",
        type: "consumable",
        ingredientDisplayNameSnapshot: "Whirlfloc"
      })];
      mockState.inventory = [yeastStock({
        ingredientCatalogItemId: "whirlfloc",
        packageVariantId: "whirlfloc-pack-6",
        normalizedQuantity: 12,
        normalizedUnit: "item",
        enteredQuantity: 2
      })];
      mockState.catalogItems = [{ id: "whirlfloc", type: "consumable", attributes: {} }];
      mockState.packageVariants = [{
        id: "whirlfloc-pack-6",
        stockContentAmount: 6,
        stockContentUnit: "pcs"
      }];

      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: uuid(302) });
      await consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: uuid(302) });

      expect(mockState.allocations[0]).toMatchObject({
        allocatedQuantityNormalized: 6,
        allocatedNormalizedUnit: "item"
      });
      expect(mockState.inventory[0]).toMatchObject({ normalizedQuantity: 6, enteredQuantity: 1 });
    });

    it("кастомные дрожжи пользователя тоже раскрываются (фолбэк 11 г)", async () => {
      mockState.lines = [yeastLine({
        ingredientCatalogItemId: null,
        userCustomIngredientId: uuid(51)
      })];
      mockState.inventory = [yeastStock({
        ingredientCatalogItemId: null,
        userCustomIngredientId: uuid(51)
      })];
      mockState.catalogItems = [];
      mockState.customIngredients = [{ id: uuid(51), type: "yeast", yeastForm: "dry", properties: {} }];

      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1));

      expect(mockState.allocations[0]).toMatchObject({
        allocatedQuantityNormalized: 11,
        allocatedNormalizedUnit: "g"
      });
    });

    it("нехватка дрожжей не роняет варку: списываем остаток и метим аллокацию", async () => {
      mockState.brewBatches = [{ id: uuid(303), status: "brewing" }];
      mockState.lines = [yeastLine({ amountNormalizedQuantity: 2 })];
      mockState.inventory = [yeastStock({ normalizedQuantity: 11, enteredQuantity: 1 })];

      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: uuid(303) });
      expect(mockState.allocations[0]).toMatchObject({ allocatedQuantityNormalized: 22 });

      const coverage = await consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: uuid(303) });

      expect(mockState.inventory[0]).toMatchObject({ normalizedQuantity: 0, enteredQuantity: 0 });
      expect(mockState.transactions[0]).toMatchObject({ quantityDeltaNormalized: -11 });
      expect(mockState.allocations[0]).toMatchObject({
        status: "consumed",
        // Аллокация фиксирует РЕАЛЬНО списанное — иначе возврат партии вернул бы
        // на склад больше, чем взял.
        allocatedQuantityNormalized: 11
      });
      expect(mockState.allocations[0].allocationMeta).toMatchObject({
        clamped: true,
        requestedQuantityNormalized: 22
      });
      // Покрытие показывает исходное требование, а не обрезанное.
      expect(coverage.lines[0]).toMatchObject({
        status: "consumed",
        requiredQuantityNormalized: 22
      });
    });

    it("пустая позиция: списывать нечего — аллокация не помечается consumed", async () => {
      mockState.inventory = [yeastStock({ normalizedQuantity: 0, enteredQuantity: 0 })];

      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: uuid(304) });
      await consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: uuid(304) });

      expect(mockState.transactions).toHaveLength(0);
      expect(mockState.allocations[0]).toMatchObject({ status: "allocated" });
    });

    it("нехватка НЕ-дрожжей по-прежнему ошибка (кламп только для дрожжей)", async () => {
      mockState.lines = [yeastLine({
        ingredientCatalogItemId: "hop-cascade",
        ingredientCategory: "hop",
        type: "hop",
        amountNormalizedQuantity: 50,
        amountNormalizedUnit: "g"
      })];
      mockState.inventory = [yeastStock({
        ingredientCatalogItemId: "hop-cascade",
        normalizedQuantity: 20,
        normalizedUnit: "g",
        enteredQuantity: 20,
        enteredUnit: "g"
      })];

      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: uuid(305) });

      await expect(consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: uuid(305) }))
        .rejects.toThrow("INSUFFICIENT_STOCK");
    });

    it("неконвертируемая пара единиц молча пропускается (склад в пачках без содержимого)", async () => {
      mockState.lines = [yeastLine({ amountNormalizedQuantity: 5, amountNormalizedUnit: "g" })];
      mockState.inventory = [yeastStock({
        normalizedQuantity: 2,
        normalizedUnit: "pack",
        enteredQuantity: 2
      })];
      mockState.catalogItems = [dryYeastCatalogItem({ form: "liquid" })];

      const coverage = await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1));

      expect(mockState.allocations).toHaveLength(0);
      expect(coverage.lines[0]).toMatchObject({ status: "unselected", inventoryItemId: null });
    });

    it("идемпотентность: два автоподбора + одно списание = одна транзакция", async () => {
      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: uuid(306) });
      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: uuid(306) });
      await consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: uuid(306) });
      await consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: uuid(306) });

      expect(mockState.allocations.filter((allocation) => allocation.status === "consumed")).toHaveLength(1);
      expect(mockState.transactions).toHaveLength(1);
      expect(mockState.inventory[0].normalizedQuantity).toBe(11);
    });
  });

  // H1: потребность строки пересчитывается под ОБЪЁМ ПАРТИИ — тем же множителем,
  // которым её считает матч (features/recipes/batch-scale.ts). Раньше списание брало
  // amountNormalizedQuantity как есть, а матч масштабировал под дефолтный профиль
  // оборудования: страница партии обещала «хватает», кнопка отвечала INSUFFICIENT_STOCK.
  describe("пересчёт под объём партии", () => {
    const BATCH = uuid(401);

    it("партия 30 л по рецепту 20 л: аллокация 75 г вместо 50 г", async () => {
      const coverage = await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), {
        brewBatchId: BATCH,
        targetBatchVolumeL: 30
      });

      expect(mockState.allocations[0]).toMatchObject({
        allocatedQuantityNormalized: 75,
        allocatedNormalizedUnit: "g"
      });
      // След пересчёта — в мете аллокации (аудит расхождений).
      expect(mockState.allocations[0].allocationMeta).toMatchObject({ batchScaleFactor: 1.5 });
      expect(coverage.lines[0]).toMatchObject({ status: "covered", requiredQuantityNormalized: 75 });
    });

    it("списывается ровно то, что обещал матч этой партии (75 г, а не 50 г)", async () => {
      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: BATCH, targetBatchVolumeL: 30 });
      await consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: BATCH, targetBatchVolumeL: 30 });

      expect(mockState.inventory[0]).toMatchObject({ normalizedQuantity: 25, enteredQuantity: 25 });
      expect(mockState.transactions[0]).toMatchObject({
        quantityDeltaNormalized: -75,
        quantityBeforeNormalized: 100,
        quantityAfterNormalized: 25
      });
    });

    it("партия меньше рецепта (10 л на 20 л): списываем половину, а не полный рецепт", async () => {
      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: BATCH, targetBatchVolumeL: 10 });
      await consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: BATCH, targetBatchVolumeL: 10 });

      expect(mockState.allocations[0]).toMatchObject({ allocatedQuantityNormalized: 25 });
      expect(mockState.inventory[0]).toMatchObject({ normalizedQuantity: 75 });
    });

    it("объём партии неизвестен → количества рецепта как есть (множитель 1)", async () => {
      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: BATCH, targetBatchVolumeL: null });

      expect(mockState.allocations[0]).toMatchObject({ allocatedQuantityNormalized: 50 });
      expect(mockState.allocations[0].allocationMeta).not.toHaveProperty("batchScaleFactor");
    });

    it("нехватка под объём партии — честная ошибка, а не молчаливое недосписание", async () => {
      // 100 г на складе, партия на 60 л требует 150 г.
      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: BATCH, targetBatchVolumeL: 60 });

      await expect(consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: BATCH, targetBatchVolumeL: 60 }))
        .rejects.toThrow("INSUFFICIENT_STOCK");
      expect(mockState.transactions).toHaveLength(0);
      expect(mockState.inventory[0].normalizedQuantity).toBe(100);
    });
  });

  // H3: два перекрывающихся списания одной партии (две вкладки/ретрай) читали остаток
  // без блокировки и писали абсолютное значение — склад уменьшался дважды, а аллокация
  // проводилась одна. Теперь склад трогает только тот запрос, чей условный UPDATE
  // реально забрал аллокацию (status ∈ активные).
  describe("гонка списания", () => {
    const BATCH = uuid(402);

    it("две параллельные попытки списания одной партии = одно списание", async () => {
      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: BATCH });

      await Promise.all([
        consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: BATCH }),
        consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: BATCH })
      ]);

      expect(mockState.transactions).toHaveLength(1);
      expect(mockState.inventory[0].normalizedQuantity).toBe(50);
      expect(mockState.allocations.filter((a) => a.status === "consumed")).toHaveLength(1);
    });

    it("дубли аллокаций на одну строку (след гонки подбора) не списывают склад дважды", async () => {
      // Так выглядит след двух параллельных автоподборов до фикса: две активные
      // аллокации на одну строку рецепта. Уникального индекса на (партия, строка)
      // в схеме нет, поэтому движок обязан вычистить дубль сам.
      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: BATCH });
      mockState.allocations.push({
        ...mockState.allocations[0],
        id: uuid(999),
        status: "allocated"
      });

      await consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: BATCH });

      expect(mockState.transactions).toHaveLength(1);
      expect(mockState.inventory[0].normalizedQuantity).toBe(50);
      expect(mockState.allocations.filter((a) => a.status === "consumed")).toHaveLength(1);
      expect(mockState.allocations.filter((a) => a.status === "released")).toHaveLength(1);
    });
  });

  // B1-Ш4: автоподбор на варку уважает лот, выбранный в пикере, и не падает на
  // чужом published-рецепте (варка без клона).
  describe("автоподбор на варку", () => {
    it("берёт лот из inventorySelectionMeta, а не самый большой остаток", async () => {
      mockState.lines[0].inventorySelectionMeta = { inventoryItemId: uuid(22) };
      mockState.inventory = [
        {
          ...mockState.inventory[0],
          id: uuid(21),
          normalizedQuantity: 500,
          enteredQuantity: 500
        },
        {
          ...mockState.inventory[0],
          id: uuid(22),
          normalizedQuantity: 100,
          enteredQuantity: 100
        }
      ];

      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1));

      expect(mockState.allocations).toHaveLength(1);
      expect(mockState.allocations[0]).toMatchObject({
        inventoryItemId: uuid(22),
        allocatedQuantityNormalized: 50
      });
    });

    it("списание на варку ЧУЖОГО published-рецепта не падает NOT_FOUND", async () => {
      mockState.brewBatches = [{ id: uuid(307), status: "brewing" }];
      mockState.recipes = [{
        id: uuid(1),
        authorId: uuid(9),
        title: "Чужой рецепт",
        publicationState: "published"
      }];

      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: uuid(307) });
      const coverage = await consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: uuid(307) });

      expect(mockState.inventory[0].normalizedQuantity).toBe(50);
      expect(coverage.lines[0]?.status).toBe("consumed");
      // Строки чужого рецепта не мутируем: selection-meta осталась прежней.
      expect(mockState.lines[0].inventorySelectionMeta).toMatchObject({ inventoryItemId: uuid(21) });
    });
  });

  // --- дожим засыпи под эффективность оборудования --------------------------
  //
  // Варка на 65% против авторских 75%: солода нужно ×1.154, иначе не добрать OG.
  // Дожим действует ТОЛЬКО на то, на что действует эффективность затирания: солод
  // и зерновые добавки. Сахар (усваивается полностью) и хмель — только по объёму.
  describe("efficiencyFactor", () => {
    const EFFICIENCY_FACTOR = 75 / 65;

    beforeEach(() => {
      mockState.lines = [
        {
          id: uuid(11),
          recipeId: uuid(1),
          persistentKey: uuid(111),
          displayOrder: 0,
          type: "malt",
          ingredientCatalogItemId: "pilsner-malt",
          userCustomIngredientId: null,
          ingredientDisplayNameSnapshot: "Пильзнер",
          amountNormalizedQuantity: 4000,
          amountNormalizedUnit: "g",
          inventoryIntentMode: "use_stock",
          inventorySelectionMeta: null
        },
        {
          id: uuid(12),
          recipeId: uuid(1),
          persistentKey: uuid(112),
          displayOrder: 1,
          type: "fermentable",
          ingredientCatalogItemId: "dextrose",
          userCustomIngredientId: null,
          ingredientDisplayNameSnapshot: "Декстроза",
          amountNormalizedQuantity: 1000,
          amountNormalizedUnit: "g",
          inventoryIntentMode: "use_stock",
          inventorySelectionMeta: null
        },
        {
          id: uuid(13),
          recipeId: uuid(1),
          persistentKey: uuid(113),
          displayOrder: 2,
          type: "hop",
          ingredientCatalogItemId: "hop-cascade",
          userCustomIngredientId: null,
          ingredientDisplayNameSnapshot: "Cascade",
          amountNormalizedQuantity: 50,
          amountNormalizedUnit: "g",
          inventoryIntentMode: "use_stock",
          inventorySelectionMeta: null
        }
      ];
      mockState.inventory = [];
      mockState.catalogItems = [
        { id: "pilsner-malt", type: "malt", attributes: { malt_type: "base" } },
        { id: "dextrose", type: "fermentable", attributes: { product_family: "sugar" } },
        { id: "hop-cascade", type: "hop", attributes: {} }
      ];
    });

    it("дожимает ТОЛЬКО засыпь: солод ×1.154, сахар и хмель — как были", async () => {
      const coverage = await listRecipeStockCoverage(uuid(2), uuid(1), {
        efficiencyFactor: EFFICIENCY_FACTOR
      });

      const [malt, sugar, hop] = coverage.lines;
      expect(malt.requiredQuantityNormalized).toBeCloseTo(4615.385, 2);
      expect(sugar.requiredQuantityNormalized).toBe(1000);
      expect(hop.requiredQuantityNormalized).toBe(50);
    });

    it("складывается с объёмом партии: 10 л из рецепта на 20 л при 65% → солод ×0.5×1.154", async () => {
      const coverage = await listRecipeStockCoverage(uuid(2), uuid(1), {
        targetBatchVolumeL: 10,
        efficiencyFactor: EFFICIENCY_FACTOR
      });

      expect(coverage.lines[0].requiredQuantityNormalized).toBeCloseTo(2307.692, 2);
      expect(coverage.lines[2].requiredQuantityNormalized).toBe(25);
    });

    it("без дожима (эффективность совпала) движок за техданными каталога не ходит", async () => {
      const coverage = await listRecipeStockCoverage(uuid(2), uuid(1), { efficiencyFactor: 1 });

      expect(coverage.lines[0].requiredQuantityNormalized).toBe(4000);
    });
  });

  // Ф4б: opt-in-послабление INSUFFICIENT_STOCK для НЕ-presence-based строк (солод,
  // хмель и т.п. — не только дрожжи). Две строки рецепта, короткая первой: мок
  // recipeInventoryAllocations.findMany отдаёт аллокации в порядке пуша (см.
  // vi.mock("@nb/db") выше — сортировки по inventoryItemId здесь нет, в отличие от
  // brew-batch-consume-substitution.test.ts), а autoAllocate создаёт их в порядке
  // mockState.lines — короткая строка обрабатывается ПЕРВОЙ, что и делает регресс-тест
  // (дефолт) содержательным: движок обязан остановиться до того, как тронул склад по
  // второй, ещё не обработанной строке.
  describe("allowPartialConsume (Ф4б): частичное списание не-presence-based строк", () => {
    const BATCH = uuid(410);
    const MALT_LINE_ID = uuid(51);
    const HOP_LINE_ID = uuid(52);
    const MALT_ITEM_ID = uuid(61);
    const HOP_ITEM_ID = uuid(62);

    beforeEach(() => {
      mockState.lines = [
        {
          id: MALT_LINE_ID,
          recipeId: uuid(1),
          persistentKey: uuid(151),
          displayOrder: 0,
          type: "malt",
          ingredientCategory: "fermentable",
          ingredientCatalogItemId: "pilsner-malt",
          userCustomIngredientId: null,
          ingredientDisplayNameSnapshot: "Пильзнер",
          amountNormalizedQuantity: 5000,
          amountNormalizedUnit: "g",
          inventoryIntentMode: "use_stock",
          inventorySelectionMeta: null
        },
        {
          id: HOP_LINE_ID,
          recipeId: uuid(1),
          persistentKey: uuid(152),
          displayOrder: 1,
          type: "hop",
          ingredientCategory: "hop",
          ingredientCatalogItemId: "hop-cascade",
          userCustomIngredientId: null,
          ingredientDisplayNameSnapshot: "Cascade",
          amountNormalizedQuantity: 50,
          amountNormalizedUnit: "g",
          inventoryIntentMode: "use_stock",
          inventorySelectionMeta: null
        }
      ];
      mockState.inventory = [
        {
          id: MALT_ITEM_ID,
          userId: uuid(2),
          ingredientCatalogItemId: "pilsner-malt",
          userCustomIngredientId: null,
          ingredientDisplayNameSnapshot: "Пильзнер (склад)",
          // Короче требуемых 5000 г — ровно случай владельца («рисовая лузга»
          // не хватает на складе, но остальное списать хочется).
          normalizedQuantity: 3000,
          normalizedUnit: "g",
          enteredQuantity: 3000,
          enteredUnit: "g",
          archivedAt: null,
          updatedAt: new Date("2026-01-01T00:00:00.000Z")
        },
        {
          id: HOP_ITEM_ID,
          userId: uuid(2),
          ingredientCatalogItemId: "hop-cascade",
          userCustomIngredientId: null,
          ingredientDisplayNameSnapshot: "Cascade (склад)",
          normalizedQuantity: 200,
          normalizedUnit: "g",
          enteredQuantity: 200,
          enteredUnit: "g",
          archivedAt: null,
          updatedAt: new Date("2026-01-01T00:00:00.000Z")
        }
      ];
      mockState.catalogItems = [
        { id: "pilsner-malt", type: "malt", attributes: { malt_type: "base" } },
        { id: "hop-cascade", type: "hop", attributes: {} }
      ];
      mockState.allocations = [];
      mockState.transactions = [];
    });

    it("без флага (дефолт): INSUFFICIENT_STOCK на короткой строке — ПОЛНЫЙ откат, вторую строку движок не трогает", async () => {
      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: BATCH });

      await expect(consumeRecipeInventoryAllocations(uuid(2), uuid(1), { brewBatchId: BATCH }))
        .rejects.toThrow("INSUFFICIENT_STOCK");

      // Ни одной транзакции — включая по второй, вполне исправной строке: частично
      // закоммиченного списания без allowPartial быть не должно (регресс-инвариант).
      expect(mockState.transactions).toHaveLength(0);
      expect(mockState.inventory.find((item) => item.id === MALT_ITEM_ID)?.normalizedQuantity).toBe(3000);
      expect(mockState.inventory.find((item) => item.id === HOP_ITEM_ID)?.normalizedQuantity).toBe(200);
    });

    it("allowPartialConsume=true: короткая строка клампится до остатка, вторая строка списывается полностью", async () => {
      await autoAllocateRecipeInventoryFromStock(uuid(2), uuid(1), { brewBatchId: BATCH });

      const coverage = await consumeRecipeInventoryAllocations(uuid(2), uuid(1), {
        brewBatchId: BATCH,
        allowPartialConsume: true
      });

      // Короткая строка (солод, НЕ дрожжи) ушла в 0 — списали весь остаток тем же
      // кламп-путём, что раньше был доступен только presence-based строкам.
      const maltItem = mockState.inventory.find((item) => item.id === MALT_ITEM_ID)!;
      expect(maltItem.normalizedQuantity).toBe(0);
      const maltAllocation = mockState.allocations.find((allocation) => allocation.recipeIngredientId === MALT_LINE_ID)!;
      expect(maltAllocation).toMatchObject({ status: "consumed", allocatedQuantityNormalized: 3000 });
      expect(maltAllocation.allocationMeta).toMatchObject({
        clamped: true,
        requestedQuantityNormalized: 5000
      });

      // Вторая (исправная) строка списана полностью — partial-режим не заставляет
      // клампить то, чего он не касается.
      const hopItem = mockState.inventory.find((item) => item.id === HOP_ITEM_ID)!;
      expect(hopItem.normalizedQuantity).toBe(150);
      expect(mockState.transactions).toHaveLength(2);
      expect(coverage.lines.find((recipeLine) => recipeLine.recipeIngredientId === HOP_LINE_ID)?.status).toBe("consumed");
    });
  });
});
