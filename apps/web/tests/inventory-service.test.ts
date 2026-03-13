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
      ingredientFamilyId: "ingredientFamilyId",
      ingredientCategory: "ingredientCategory",
      ingredientSubtype: "ingredientSubtype",
      ingredientDisplayNameSnapshot: "ingredientDisplayNameSnapshot",
      ingredientDefaultDisplayUnitSnapshot: "ingredientDefaultDisplayUnitSnapshot",
      ingredientMeasurementDimension: "ingredientMeasurementDimension",
      enteredQuantity: "enteredQuantity",
      enteredUnit: "enteredUnit",
      normalizedQuantity: "normalizedQuantity",
      normalizedUnit: "normalizedUnit",
      unitDimension: "unitDimension",
      purchasePriceMinor: "purchasePriceMinor",
      purchaseCurrency: "purchaseCurrency",
      purchaseQuantity: "purchaseQuantity",
      purchaseQuantityUnit: "purchaseQuantityUnit",
      purchaseQuantityNormalized: "purchaseQuantityNormalized",
      purchaseQuantityNormalizedUnit: "purchaseQuantityNormalizedUnit",
      normalizedUnitCostMinorRub: "normalizedUnitCostMinorRub",
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
  deleted: [] as Array<{ table: string; where: unknown }>,
  selectRows: [] as any[]
  }
}));

vi.mock("../features/system/currency-rates", () => ({
  systemCurrencies: ["RUB", "USD", "EUR"],
  listSystemCurrencyRates: async () => ({ RUB: 100, USD: 7900, EUR: 9170 }),
  convertCurrencyMinorToRubMinor: (amountMinor: number, currency: "RUB" | "USD" | "EUR", rates: Record<string, number>) => (
    Math.round((amountMinor * rates[currency]) / 100)
  )
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
    delete: (table: { name: string }) => ({
      where: async (where: unknown) => {
        mockState.deleted.push({ table: table.name, where });
      }
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
  deleteInventoryItem,
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
    mockState.deleted = [];
    mockState.selectRows = [];
    mockState.catalogFindFirst.mockReset();
    mockState.customFindFirst.mockReset();
    mockState.inventoryFindFirst.mockReset();
  });

  it("creates user custom ingredient with normalized name", async () => {
    const created = await createUserCustomIngredient("u1", {
      category: "hop",
      subtype: "pellet",
      defaultDisplayUnit: "g",
      displayName: "  Citra, T-90  "
    });

    expect(created.displayName).toBe("Citra, T-90");
    expect(created.normalizedName).toBe("citra t-90");
    expect(mockState.inserted[0]?.table).toBe("userCustomIngredients");
    expect(mockState.inserted[0]?.values.properties).toMatchObject({
      taxonomyCategory: "hop",
      taxonomySubtype: "pellet",
      defaultDisplayUnit: "g"
    });
  });

  it("adds catalog ingredient to inventory", async () => {
    mockState.catalogFindFirst.mockResolvedValueOnce({
      id: "cat-1",
      status: "active",
      type: "fermentable",
      category: "fermentable",
      subtype: "base_malt",
      familyId: "fam-1",
      displayName: "Pilsner Malt",
      defaultDisplayUnit: "kg",
      allowedUnits: ["g", "kg"],
      measurementDimension: "weight"
    });

    const created = await addCatalogIngredientToInventory("u1", {
      ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      enteredQuantity: 2,
      enteredUnit: "kg"
    });

    expect(created.ingredientCatalogItemId).toBe("3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0");
    expect(mockState.inserted[0]?.values).toMatchObject({
      userId: "u1",
      ingredientFamilyId: "fam-1",
      ingredientCategory: "fermentable",
      ingredientSubtype: "base_malt",
      ingredientDisplayNameSnapshot: "Pilsner Malt",
      ingredientDefaultDisplayUnitSnapshot: "kg",
      ingredientMeasurementDimension: "weight",
      enteredQuantity: 2,
      enteredUnit: "kg",
      normalizedQuantity: 2000,
      normalizedUnit: "g",
      unitDimension: "weight"
    });
  });

  it("adds custom ingredient to inventory with ownership check", async () => {
    mockState.customFindFirst.mockResolvedValueOnce({
      id: "custom-1",
      userId: "u1",
      type: "yeast",
      displayName: "House Lager",
      properties: {
        taxonomyCategory: "yeast",
        taxonomySubtype: "lager",
        defaultDisplayUnit: "pack",
        allowedUnits: ["pack", "g"],
        measurementDimension: "count"
      }
    });

    await addCustomIngredientToInventory("u1", {
      userCustomIngredientId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      enteredQuantity: 1,
      enteredUnit: "pack"
    });

    expect(mockState.inserted[0]?.table).toBe("userIngredients");
    expect(mockState.inserted[0]?.values).toMatchObject({
      ingredientCategory: "yeast",
      ingredientSubtype: "lager",
      ingredientDisplayNameSnapshot: "House Lager",
      ingredientDefaultDisplayUnitSnapshot: "pack",
      ingredientMeasurementDimension: "count",
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
      userCustomIngredientId: null,
      ingredientCategory: "hop",
      ingredientSubtype: "pellet",
      ingredientDefaultDisplayUnitSnapshot: "g",
      ingredientMeasurementDimension: "weight"
    });
    mockState.catalogFindFirst.mockResolvedValueOnce({
      id: "cat-1",
      status: "active",
      type: "hop",
      category: "hop",
      subtype: "pellet",
      familyId: "fam-hop",
      displayName: "Cascade",
      defaultDisplayUnit: "g",
      allowedUnits: ["g", "oz"],
      measurementDimension: "weight"
    });

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
      userCustomIngredientId: null,
      ingredientCategory: "fermentable",
      ingredientSubtype: "base_malt",
      ingredientDefaultDisplayUnitSnapshot: "kg",
      ingredientMeasurementDimension: "weight"
    });
    mockState.catalogFindFirst.mockResolvedValueOnce({
      id: "cat-2",
      status: "active",
      type: "fermentable",
      category: "fermentable",
      subtype: "base_malt",
      familyId: "fam-2",
      displayName: "Maris Otter",
      defaultDisplayUnit: "kg",
      allowedUnits: ["g", "kg"],
      measurementDimension: "weight"
    });

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
      ingredientFamilyId: "fam-2",
      ingredientCategory: "fermentable",
      ingredientSubtype: "base_malt",
      ingredientDisplayNameSnapshot: "Maris Otter",
      ingredientDefaultDisplayUnitSnapshot: "kg",
      ingredientMeasurementDimension: "weight",
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
    mockState.catalogFindFirst.mockResolvedValueOnce({
      id: "cat-1",
      status: "active",
      type: "misc",
      category: "water_prep",
      subtype: "acid",
      defaultDisplayUnit: "ml",
      allowedUnits: ["ml", "l", "gal"],
      measurementDimension: "volume",
      technicalData: { category: "water_prep", subtype: "acid", acidType: "Lactic", compound: null, strengthPct: 80, purityPct: null, physicalForm: "liquid" }
    });

    await expect(addCatalogIngredientToInventory("u1", {
      ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      enteredQuantity: 1,
      enteredUnit: "pack"
    })).rejects.toThrowError("INCOMPATIBLE_UNIT");
  });

  it("stores purchase context and normalized rub unit cost", async () => {
    mockState.catalogFindFirst.mockResolvedValueOnce({
      id: "cat-1",
      status: "active",
      type: "fermentable",
      category: "fermentable",
      subtype: "base_malt",
      familyId: "fam-1",
      displayName: "Pilsner Malt",
      defaultDisplayUnit: "kg",
      allowedUnits: ["g", "kg"],
      measurementDimension: "weight"
    });

    await addCatalogIngredientToInventory("u1", {
      ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      enteredQuantity: 5,
      enteredUnit: "kg",
      purchasePriceMinor: 125000,
      purchaseCurrency: "RUB",
      purchaseQuantity: 5,
      purchaseQuantityUnit: "kg"
    });

    expect(mockState.inserted[0]?.values).toMatchObject({
      purchasePriceMinor: 125000,
      purchaseCurrency: "RUB",
      purchaseQuantity: 5,
      purchaseQuantityUnit: "kg",
      purchaseQuantityNormalized: 5000,
      purchaseQuantityNormalizedUnit: "g",
      normalizedUnitCostMinorRub: 25
    });
  });

  it("archives inventory item", async () => {
    mockState.inventoryFindFirst.mockResolvedValueOnce({ id: "inv-1", userId: "u1" });

    await archiveInventoryItem("u1", "inv-1");

    expect(mockState.updates[0]?.set.archivedAt).toBeInstanceOf(Date);
  });

  it("deletes inventory item", async () => {
    mockState.inventoryFindFirst.mockResolvedValueOnce({ id: "inv-1", userId: "u1" });

    await deleteInventoryItem("u1", "inv-1");

    expect(mockState.deleted[0]?.table).toBe("userIngredients");
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
          ingredientCatalogItemId: "cat-1",
          userCustomIngredientId: null,
          ingredientFamilyId: "fam-1",
          ingredientCategory: "fermentable",
          ingredientSubtype: "base_malt",
          ingredientDisplayNameSnapshot: "Pilsner Malt",
          ingredientDefaultDisplayUnitSnapshot: "kg",
          ingredientMeasurementDimension: "weight",
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
        catalog: {
          id: "cat-1",
          type: "fermentable",
          category: "fermentable",
          subtype: "base_malt",
          familyId: "fam-1",
          displayName: "Pilsner Malt",
          normalizedName: "pilsner malt",
          defaultDisplayUnit: "kg",
          allowedUnits: ["g", "kg"],
          measurementDimension: "weight",
          manufacturer: "BESTMALZ",
          country: "DE",
          properties: { colorEbc: 3.5, extractFgdbPct: 80 }
        },
        custom: null
      }
    ];

    const items = await listInventoryForUser("u1");

    expect(items).toHaveLength(1);
    expect(items[0]?.source.sourceKind).toBe("catalog");
    expect(items[0]).toMatchObject({
      ingredientFamilyId: "fam-1",
      ingredientCategory: "fermentable",
      ingredientSubtype: "base_malt",
      ingredientDisplayNameSnapshot: "Pilsner Malt",
      ingredientDefaultDisplayUnitSnapshot: "kg",
      ingredientMeasurementDimension: "weight",
      enteredQuantity: 2,
      enteredUnit: "kg",
      normalizedQuantity: 2000,
      normalizedUnit: "g",
      unitDimension: "weight"
    });
    expect(items[0]?.source).toMatchObject({
      manufacturer: "BESTMALZ",
      country: "DE",
      fermentableColorEbc: 3.5,
      fermentableExtractYieldPct: 80
    });
  });

  it("reads persisted taxonomy snapshot even without live source row", async () => {
    mockState.selectRows = [
      {
        inventory: {
          id: "inv-1",
          ingredientCatalogItemId: "cat-missing",
          userCustomIngredientId: null,
          ingredientFamilyId: "fam-1",
          ingredientCategory: "hop",
          ingredientSubtype: "pellet",
          ingredientDisplayNameSnapshot: "Legacy Cascade",
          ingredientDefaultDisplayUnitSnapshot: "g",
          ingredientMeasurementDimension: "weight",
          enteredQuantity: 100,
          enteredUnit: "g",
          normalizedQuantity: 100,
          normalizedUnit: "g",
          unitDimension: "weight",
          purchasePriceMinor: null,
          purchaseCurrency: null,
          purchaseQuantity: null,
          purchaseQuantityUnit: null,
          purchaseQuantityNormalized: null,
          purchaseQuantityNormalizedUnit: null,
          normalizedUnitCostMinorRub: null,
          purchasedAt: null,
          freshnessDate: null,
          notes: null,
          archivedAt: null,
          createdAt: new Date("2025-01-01"),
          updatedAt: new Date("2025-01-01")
        },
        catalog: null,
        custom: null
      }
    ];

    const items = await listInventoryForUser("u1");

    expect(items[0]).toMatchObject({
      ingredientFamilyId: "fam-1",
      ingredientCategory: "hop",
      ingredientSubtype: "pellet",
      ingredientDisplayNameSnapshot: "Legacy Cascade"
    });
    expect(items[0]?.source.displayName).toBe("Legacy Cascade");
    expect(items[0]?.source.category).toBe("hop");
  });

  it("returns deduplicated inventory suggestions for autocomplete", async () => {
    mockState.selectRows = [
      {
        inventory: {
          id: "inv-1",
          ingredientCatalogItemId: "cat-1",
          userCustomIngredientId: null,
          ingredientFamilyId: "fam-1",
          ingredientCategory: "fermentable",
          ingredientSubtype: "base_malt",
          ingredientDisplayNameSnapshot: "Pilsner Malt",
          ingredientDefaultDisplayUnitSnapshot: "kg",
          ingredientMeasurementDimension: "weight",
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
        catalog: {
          id: "cat-1",
          type: "fermentable",
          category: "fermentable",
          subtype: "base_malt",
          familyId: "fam-1",
          displayName: "Pilsner Malt",
          normalizedName: "pilsner malt",
          defaultDisplayUnit: "kg",
          allowedUnits: ["g", "kg"],
          measurementDimension: "weight"
        },
        custom: null
      },
      {
        inventory: {
          id: "inv-2",
          ingredientCatalogItemId: "cat-1",
          userCustomIngredientId: null,
          ingredientFamilyId: "fam-1",
          ingredientCategory: "fermentable",
          ingredientSubtype: "base_malt",
          ingredientDisplayNameSnapshot: "Pilsner Malt",
          ingredientDefaultDisplayUnitSnapshot: "kg",
          ingredientMeasurementDimension: "weight",
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
        catalog: {
          id: "cat-1",
          type: "fermentable",
          category: "fermentable",
          subtype: "base_malt",
          familyId: "fam-1",
          displayName: "Pilsner Malt",
          normalizedName: "pilsner malt",
          defaultDisplayUnit: "kg",
          allowedUnits: ["g", "kg"],
          measurementDimension: "weight"
        },
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
      { archivedAt: null, catalogType: "hop", customType: null, ingredientCategory: "hop", ingredientSubtype: "pellet" },
      { archivedAt: new Date("2025-01-01"), catalogType: null, customType: "misc", ingredientCategory: "misc", ingredientSubtype: "fining" }
    ];

    const summary = await getInventorySummaries("u1");

    expect(summary.totalItems).toBe(2);
    expect(summary.activeItems).toBe(1);
    expect(summary.archivedItems).toBe(1);
    expect(summary.byType.hop).toBe(1);
    expect(summary.byType.misc).toBe(1);
  });
});
