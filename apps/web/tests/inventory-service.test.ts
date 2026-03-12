import { beforeEach, describe, expect, it, vi } from "vitest";

const { tableRefs, mockState } = vi.hoisted(() => ({
  tableRefs: {
    ingredientCatalogItems: { name: "ingredientCatalogItems", id: "id", status: "status", type: "type", displayName: "displayName", normalizedName: "normalizedName" },
    userCustomIngredients: { name: "userCustomIngredients", id: "id", userId: "userId", type: "type", displayName: "displayName", normalizedName: "normalizedName" },
    userIngredients: {
      name: "userIngredients",
      id: "id",
      userId: "userId",
      ingredientCatalogItemId: "ingredientCatalogItemId",
      userCustomIngredientId: "userCustomIngredientId",
      enteredQuantity: "enteredQuantity",
      enteredUnit: "enteredUnit",
      normalizedQuantity: "normalizedQuantity",
      normalizedUnit: "normalizedUnit",
      unitDimension: "unitDimension",
      purchasedAt: "purchasedAt",
      freshnessDate: "freshnessDate",
      notes: "notes",
      archivedAt: "archivedAt",
      createdAt: "createdAt",
      updatedAt: "updatedAt"
    }
  },
  mockState: {
  idCounter: 0,
  catalogFindFirst: vi.fn(async (_arg?: unknown) => null as any),
  customFindFirst: vi.fn(async (_arg?: unknown) => null as any),
  inventoryFindFirst: vi.fn(async (_arg?: unknown) => null as any),
  inserted: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; set: Record<string, unknown> }>,
  selectRows: [] as any[]
  }
}));

vi.mock("@nb/db", () => {
  const db = {
    query: {
      ingredientCatalogItems: { findFirst: (arg: unknown) => mockState.catalogFindFirst(arg) },
      userCustomIngredients: { findFirst: (arg: unknown) => mockState.customFindFirst(arg) },
      userIngredients: { findFirst: (arg: unknown) => mockState.inventoryFindFirst(arg) }
    },
    insert: (table: { name: string }) => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          const row = { ...values, id: `new-${++mockState.idCounter}`, createdAt: new Date("2025-01-01T00:00:00.000Z"), updatedAt: new Date("2025-01-01T00:00:00.000Z") };
          mockState.inserted.push({ table: table.name, values });
          return [row];
        }
      })
    }),
    update: (table: { name: string }) => ({
      set: (set: Record<string, unknown>) => ({
        where: (_where: unknown) => ({
          returning: async () => {
            mockState.updates.push({ table: table.name, set });
            return [{ id: "inv-1", ...set }];
          }
        })
      })
    }),
    select: (shape: Record<string, unknown>) => ({
      from: (_table: unknown) => ({
        leftJoin: (_a: unknown, _b: unknown) => ({
          leftJoin: (_c: unknown, _d: unknown) => ({
            where: (_w: unknown) => {
              if ("archivedAt" in shape) {
                return Promise.resolve(mockState.selectRows);
              }

              return {
                orderBy: async (_o: unknown) => mockState.selectRows
              };
            }
          })
        })
      })
    })
  };

  return {
    db,
    and: (...args: unknown[]) => args,
    asc: (v: unknown) => v,
    eq: (...args: unknown[]) => args,
    isNull: (v: unknown) => v,
    sql: (..._args: unknown[]) => ({}) as never,
    ingredientCatalogItems: tableRefs.ingredientCatalogItems,
    userCustomIngredients: tableRefs.userCustomIngredients,
    userIngredients: tableRefs.userIngredients
  };
});

import { inventorySourceLinkageSchema } from "../features/inventory/contracts";
import {
  addCatalogIngredientToInventory,
  addCustomIngredientToInventory,
  archiveInventoryItem,
  createUserCustomIngredient,
  getInventorySummaries,
  listInventoryForUser,
  searchInventorySuggestions,
  updateInventoryItem,
  updateInventoryQuantity
} from "../features/inventory/service";

describe("inventory service", () => {
  beforeEach(() => {
    mockState.idCounter = 0;
    mockState.inserted = [];
    mockState.updates = [];
    mockState.selectRows = [];
    mockState.catalogFindFirst.mockReset();
    mockState.customFindFirst.mockReset();
    mockState.inventoryFindFirst.mockReset();
  });

  it("creates user custom ingredient with normalized name", async () => {
    const created = await createUserCustomIngredient("u1", { type: "hop", displayName: "  Citra, T-90  " });

    expect(created.displayName).toBe("Citra, T-90");
    expect(created.normalizedName).toBe("citra t-90");
    expect(mockState.inserted[0]?.table).toBe("userCustomIngredients");
  });

  it("adds catalog ingredient to inventory", async () => {
    mockState.catalogFindFirst.mockResolvedValueOnce({ id: "cat-1", status: "active", type: "fermentable" });

    const created = await addCatalogIngredientToInventory("u1", {
      ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      enteredQuantity: 2,
      enteredUnit: "kg"
    });

    expect(created.ingredientCatalogItemId).toBe("3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0");
    expect(mockState.inserted[0]?.values).toMatchObject({
      userId: "u1",
      enteredQuantity: 2,
      enteredUnit: "kg",
      normalizedQuantity: 2000,
      normalizedUnit: "g",
      unitDimension: "weight"
    });
  });

  it("adds custom ingredient to inventory with ownership check", async () => {
    mockState.customFindFirst.mockResolvedValueOnce({ id: "custom-1", userId: "u1", type: "yeast" });

    await addCustomIngredientToInventory("u1", {
      userCustomIngredientId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      enteredQuantity: 1,
      enteredUnit: "pack"
    });

    expect(mockState.inserted[0]?.table).toBe("userIngredients");
    expect(mockState.inserted[0]?.values).toMatchObject({
      enteredQuantity: 1,
      enteredUnit: "pack",
      normalizedQuantity: 1,
      normalizedUnit: "pack",
      unitDimension: "count"
    });
  });

  it("rejects invalid source linkage (both or none)", () => {
    expect(() => inventorySourceLinkageSchema.parse({ ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0", userCustomIngredientId: "4d6eb945-8e2e-4af9-8d24-ef6c883b5dd0" })).toThrow();
    expect(() => inventorySourceLinkageSchema.parse({})).toThrow();
  });

  it("updates inventory quantity", async () => {
    mockState.inventoryFindFirst.mockResolvedValueOnce({
      id: "inv-1",
      userId: "u1",
      ingredientCatalogItemId: "cat-1",
      userCustomIngredientId: null
    });
    mockState.catalogFindFirst.mockResolvedValueOnce({ id: "cat-1", status: "active", type: "hop" });

    await updateInventoryQuantity("u1", "inv-1", { enteredQuantity: 3, enteredUnit: "oz" });

    expect(mockState.updates[0]?.set).toMatchObject({
      enteredQuantity: 3,
      enteredUnit: "oz",
      normalizedQuantity: 85.049,
      normalizedUnit: "g",
      unitDimension: "weight"
    });
  });

  it("updates full inventory item including source linkage", async () => {
    mockState.inventoryFindFirst.mockResolvedValueOnce({
      id: "inv-1",
      userId: "u1",
      ingredientCatalogItemId: "cat-1",
      userCustomIngredientId: null
    });
    mockState.catalogFindFirst.mockResolvedValueOnce({ id: "cat-2", status: "active", type: "fermentable" });

    await updateInventoryItem("u1", "inv-1", {
      ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      userCustomIngredientId: null,
      enteredQuantity: 5,
      enteredUnit: "kg",
      purchasedAt: new Date("2026-03-01T00:00:00.000Z"),
      freshnessDate: new Date("2026-08-01T00:00:00.000Z"),
      notes: "Обновили источник"
    });

    expect(mockState.updates[0]?.set).toMatchObject({
      ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      userCustomIngredientId: null,
      enteredQuantity: 5,
      enteredUnit: "kg",
      normalizedQuantity: 5000,
      normalizedUnit: "g",
      unitDimension: "weight",
      notes: "Обновили источник"
    });
  });

  it("rejects unsupported units", async () => {
    await expect(addCatalogIngredientToInventory("u1", {
      ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      enteredQuantity: 1,
      enteredUnit: "stone"
    })).rejects.toThrow();
  });

  it("rejects units incompatible with ingredient type", async () => {
    mockState.catalogFindFirst.mockResolvedValueOnce({ id: "cat-1", status: "active", type: "hop" });

    await expect(addCatalogIngredientToInventory("u1", {
      ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      enteredQuantity: 1,
      enteredUnit: "pack"
    })).rejects.toThrowError("INCOMPATIBLE_UNIT");
  });

  it("archives inventory item", async () => {
    mockState.inventoryFindFirst.mockResolvedValueOnce({ id: "inv-1", userId: "u1" });

    await archiveInventoryItem("u1", "inv-1");

    expect(mockState.updates[0]?.set.archivedAt).toBeInstanceOf(Date);
  });

  it("enforces ownership checks for inventory updates", async () => {
    mockState.inventoryFindFirst.mockResolvedValueOnce(null);

    await expect(updateInventoryQuantity("u1", "inv-foreign", { enteredQuantity: 1, enteredUnit: "kg" })).rejects.toThrowError("NOT_FOUND");
  });

  it("enforces ownership checks for custom ingredient usage", async () => {
    mockState.customFindFirst.mockResolvedValueOnce(null);

    await expect(addCustomIngredientToInventory("u1", {
      userCustomIngredientId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      enteredQuantity: 1,
      enteredUnit: "kg"
    })).rejects.toThrowError("CUSTOM_INGREDIENT_NOT_FOUND");
  });

  it("lists inventory for user", async () => {
    mockState.selectRows = [
      {
        inventory: {
          id: "inv-1",
          enteredQuantity: 2,
          enteredUnit: "kg",
          normalizedQuantity: 2000,
          normalizedUnit: "g",
          unitDimension: "weight",
          purchasedAt: null,
          freshnessDate: null,
          notes: null,
          archivedAt: null,
          createdAt: new Date("2025-01-01"),
          updatedAt: new Date("2025-01-01")
        },
        catalog: { id: "cat-1", type: "fermentable", displayName: "Pilsner Malt", normalizedName: "pilsner malt" },
        custom: null
      }
    ];

    const items = await listInventoryForUser("u1");

    expect(items).toHaveLength(1);
    expect(items[0]?.source.sourceKind).toBe("catalog");
    expect(items[0]).toMatchObject({
      enteredQuantity: 2,
      enteredUnit: "kg",
      normalizedQuantity: 2000,
      normalizedUnit: "g",
      unitDimension: "weight"
    });
  });

  it("returns deduplicated inventory suggestions for autocomplete", async () => {
    mockState.selectRows = [
      {
        inventory: {
          id: "inv-1",
          enteredQuantity: 2,
          enteredUnit: "kg",
          normalizedQuantity: 2000,
          normalizedUnit: "g",
          unitDimension: "weight",
          purchasedAt: null,
          freshnessDate: null,
          notes: null,
          archivedAt: null,
          createdAt: new Date("2025-01-01"),
          updatedAt: new Date("2025-01-01")
        },
        catalog: { id: "cat-1", type: "fermentable", displayName: "Pilsner Malt", normalizedName: "pilsner malt" },
        custom: null
      },
      {
        inventory: {
          id: "inv-2",
          enteredQuantity: 1,
          enteredUnit: "kg",
          normalizedQuantity: 1000,
          normalizedUnit: "g",
          unitDimension: "weight",
          purchasedAt: null,
          freshnessDate: null,
          notes: null,
          archivedAt: null,
          createdAt: new Date("2025-01-02"),
          updatedAt: new Date("2025-01-02")
        },
        catalog: { id: "cat-1", type: "fermentable", displayName: "Pilsner Malt", normalizedName: "pilsner malt" },
        custom: null
      }
    ];

    const items = await searchInventorySuggestions("u1", { q: "Pils", limit: 8 });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "cat-1",
      displayName: "Pilsner Malt",
      source: "catalog"
    });
    expect(items[0]?.subtitle).toContain("2 поз.");
  });

  it("builds summaries", async () => {
    mockState.selectRows = [
      { archivedAt: null, catalogType: "hop", customType: null },
      { archivedAt: new Date("2025-01-01"), catalogType: null, customType: "misc" }
    ];

    const summary = await getInventorySummaries("u1");

    expect(summary.totalItems).toBe(2);
    expect(summary.activeItems).toBe(1);
    expect(summary.archivedItems).toBe(1);
    expect(summary.byType.hop).toBe(1);
    expect(summary.byType.misc).toBe(1);
  });
});
