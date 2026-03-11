import { beforeEach, describe, expect, it, vi } from "vitest";

const { tableRefs, mockState } = vi.hoisted(() => ({
  tableRefs: {
    ingredientCatalogItems: { name: "ingredientCatalogItems", id: "id", status: "status", type: "type", displayName: "displayName", normalizedName: "normalizedName" },
    userCustomIngredients: { name: "userCustomIngredients", id: "id", userId: "userId", type: "type", displayName: "displayName", normalizedName: "normalizedName" },
    userIngredients: { name: "userIngredients", id: "id", userId: "userId", ingredientCatalogItemId: "ingredientCatalogItemId", userCustomIngredientId: "userCustomIngredientId", quantity: "quantity", unit: "unit", purchasedAt: "purchasedAt", freshnessDate: "freshnessDate", notes: "notes", archivedAt: "archivedAt", createdAt: "createdAt", updatedAt: "updatedAt" }
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
    mockState.catalogFindFirst.mockResolvedValueOnce({ id: "cat-1", status: "active" });

    const created = await addCatalogIngredientToInventory("u1", { ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0", quantity: 2, unit: "kg" });

    expect(created.ingredientCatalogItemId).toBe("3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0");
    expect(mockState.inserted[0]?.values.userId).toBe("u1");
  });

  it("adds custom ingredient to inventory with ownership check", async () => {
    mockState.customFindFirst.mockResolvedValueOnce({ id: "custom-1", userId: "u1" });

    await addCustomIngredientToInventory("u1", { userCustomIngredientId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0", quantity: 500, unit: "g" });

    expect(mockState.inserted[0]?.table).toBe("userIngredients");
  });

  it("rejects invalid source linkage (both or none)", () => {
    expect(() => inventorySourceLinkageSchema.parse({ ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0", userCustomIngredientId: "4d6eb945-8e2e-4af9-8d24-ef6c883b5dd0" })).toThrow();
    expect(() => inventorySourceLinkageSchema.parse({})).toThrow();
  });

  it("updates inventory quantity", async () => {
    mockState.inventoryFindFirst.mockResolvedValueOnce({ id: "inv-1", userId: "u1" });

    await updateInventoryQuantity("u1", "inv-1", { quantity: 3, unit: "kg" });

    expect(mockState.updates[0]?.set.quantity).toBe(3);
    expect(mockState.updates[0]?.set.unit).toBe("kg");
  });

  it("archives inventory item", async () => {
    mockState.inventoryFindFirst.mockResolvedValueOnce({ id: "inv-1", userId: "u1" });

    await archiveInventoryItem("u1", "inv-1");

    expect(mockState.updates[0]?.set.archivedAt).toBeInstanceOf(Date);
  });

  it("enforces ownership checks for inventory updates", async () => {
    mockState.inventoryFindFirst.mockResolvedValueOnce(null);

    await expect(updateInventoryQuantity("u1", "inv-foreign", { quantity: 1, unit: "kg" })).rejects.toThrowError("NOT_FOUND");
  });

  it("enforces ownership checks for custom ingredient usage", async () => {
    mockState.customFindFirst.mockResolvedValueOnce(null);

    await expect(addCustomIngredientToInventory("u1", { userCustomIngredientId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0", quantity: 1, unit: "kg" })).rejects.toThrowError("CUSTOM_INGREDIENT_NOT_FOUND");
  });

  it("lists inventory for user", async () => {
    mockState.selectRows = [
      {
        inventory: { id: "inv-1", quantity: 2, unit: "kg", purchasedAt: null, freshnessDate: null, notes: null, archivedAt: null, createdAt: new Date("2025-01-01"), updatedAt: new Date("2025-01-01") },
        catalog: { id: "cat-1", type: "fermentable", displayName: "Pilsner Malt", normalizedName: "pilsner malt" },
        custom: null
      }
    ];

    const items = await listInventoryForUser("u1");

    expect(items).toHaveLength(1);
    expect(items[0]?.source.sourceKind).toBe("catalog");
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
