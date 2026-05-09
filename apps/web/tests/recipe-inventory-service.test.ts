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
      status: "status"
    },
    inventoryTransactions: { name: "inventory_transactions", id: "id" },
    userIngredients: {
      name: "user_ingredients",
      id: "id",
      userId: "userId",
      ingredientCatalogItemId: "ingredientCatalogItemId",
      userCustomIngredientId: "userCustomIngredientId"
    }
  },
  mockState: {
    idCounter: 0,
    recipes: [] as any[],
    lines: [] as any[],
    inventory: [] as any[],
    allocations: [] as any[],
    transactions: [] as any[]
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

  const db: any = {
    query: {
      recipes: {
        findFirst: async (arg: any) => {
          const id = getEqValue(arg?.where, "id");
          const authorId = getEqValue(arg?.where, "authorId");
          return mockState.recipes.find((recipe) => recipe.id === id && recipe.authorId === authorId) ?? null;
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
          const statuses = getInArrayValue(arg?.where, "status");
          return mockState.allocations.filter((allocation) => (
            allocation.userId === userId
            && allocation.recipeId === recipeId
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
          if (table.name === "recipe_inventory_allocations") {
            const id = getEqValue(where, "id");
            const userId = getEqValue(where, "userId");
            const recipeId = getEqValue(where, "recipeId");
            const lineId = getEqValue(where, "recipeIngredientId");
            const statuses = getInArrayValue(where, "status");
            mockState.allocations = mockState.allocations.map((allocation) => {
              const matches = (
                (id ? allocation.id === id : true)
                && (userId ? allocation.userId === userId : true)
                && (recipeId ? allocation.recipeId === recipeId : true)
                && (lineId ? allocation.recipeIngredientId === lineId : true)
                && (!statuses || statuses.includes(allocation.status))
              );
              return matches ? { ...allocation, ...set } : allocation;
            });
          }

          if (table.name === "recipe_ingredients") {
            const id = getEqValue(where, "id");
            mockState.lines = mockState.lines.map((line) => line.id === id ? { ...line, ...set } : line);
          }

          if (table.name === "user_ingredients") {
            const id = getEqValue(where, "id");
            mockState.inventory = mockState.inventory.map((item) => item.id === id ? { ...item, ...set } : item);
          }

          return { returning: async () => [] };
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
    inventoryTransactions: tableRefs.inventoryTransactions,
    recipeIngredients: tableRefs.recipeIngredients,
    recipeInventoryAllocations: tableRefs.recipeInventoryAllocations,
    recipes: tableRefs.recipes,
    userIngredients: tableRefs.userIngredients
  };
});

import {
  consumeRecipeInventoryAllocations,
  listRecipeStockCoverage,
  syncRecipeSelectedInventoryAllocations
} from "../features/recipes/inventory-service";

describe("recipe inventory allocation service", () => {
  beforeEach(() => {
    mockState.idCounter = 0;
    mockState.recipes = [{ id: uuid(1), authorId: uuid(2), title: "Recipe" }];
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

  it("syncs selected recipe stock lines without consuming inventory", async () => {
    const coverage = await syncRecipeSelectedInventoryAllocations(uuid(2), uuid(1));

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

    const coverage = await syncRecipeSelectedInventoryAllocations(uuid(2), uuid(1));

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

  it("skips stale stock selections without aborting coverage sync for other lines", async () => {
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

    const coverage = await syncRecipeSelectedInventoryAllocations(uuid(2), uuid(1));

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
    await syncRecipeSelectedInventoryAllocations(uuid(2), uuid(1));
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
    await syncRecipeSelectedInventoryAllocations(uuid(2), uuid(1));

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
});
