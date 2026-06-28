import { beforeEach, describe, expect, it, vi } from "vitest";

// Покрытие операций склада (CRUD над позициями): добавление каталожного/кастомного
// ингредиента, изменение количества, обнуление, архивация, удаление, конверсии единиц
// на входе, расчёт стоимости покупки, фильтры/сортировка списка, гейты владельца и
// граничные значения количества. Сервис-слой тестируется без реальной БД: `@nb/db`
// и валютные курсы мокаются in-memory (структура мок-харнесса скопирована из
// tests/inventory-service.test.ts).

const { tableRefs, mockState } = vi.hoisted(() => ({
  tableRefs: {
    ingredients: { name: "ingredients", id: "id", isActive: "isActive", type: "type" },
    ingredientPackageVariants: { name: "ingredientPackageVariants", id: "id", ingredientId: "ingredientId" },
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
      priceInputMode: "priceInputMode",
      priceInputAmountMinor: "priceInputAmountMinor",
      priceInputCurrency: "priceInputCurrency",
      purchasePriceMinor: "purchasePriceMinor",
      purchaseCurrency: "purchaseCurrency",
      purchaseQuantity: "purchaseQuantity",
      purchaseQuantityUnit: "purchaseQuantityUnit",
      purchaseQuantityNormalized: "purchaseQuantityNormalized",
      purchaseQuantityNormalizedUnit: "purchaseQuantityNormalizedUnit",
      normalizedUnitCostMinorRub: "normalizedUnitCostMinorRub",
      properties: "properties",
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
  packageVariantFindFirst: vi.fn(async (_arg?: unknown) => null as any),
  customFindFirst: vi.fn(async (_arg?: unknown) => null as any),
  inventoryFindFirst: vi.fn(async (_arg?: unknown) => null as any),
  inserted: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; set: Record<string, unknown> }>,
  deleted: [] as Array<{ table: string; where: unknown }>,
  selectRows: [] as any[]
  }
}));

vi.mock("server-only", () => ({}));

vi.mock("../features/system/currency-rates", () => ({
  systemCurrencies: ["RUB", "USD", "EUR"],
  listSystemCurrencyRates: async () => ({ RUB: 100, USD: 7900, EUR: 9170 }),
  convertCurrencyMinorToRubMinor: (amountMinor: number, currency: "RUB" | "USD" | "EUR", rates: Record<string, number>) => (
    Math.round((amountMinor * rates[currency]) / 100)
  )
}));

vi.mock("../features/ingredients/user-metadata-service", () => ({
  listIngredientPurchaseLinkSummaries: async () => new Map()
}));

vi.mock("@nb/db", () => {
  const db = {
    query: {
      ingredients: { findFirst: (arg: unknown) => mockState.catalogFindFirst(arg) },
      ingredientPackageVariants: { findFirst: (arg: unknown) => mockState.packageVariantFindFirst(arg) },
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
        where: (_where: unknown) => {
          mockState.updates.push({ table: table.name, set });
          return {
            returning: async () => [{ id: "inv-1", ...set }]
          };
        }
      })
    }),
    delete: (table: { name: string }) => ({
      where: async (where: unknown) => {
        mockState.deleted.push({ table: table.name, where });
      }
    }),
    select: (shape: Record<string, unknown>) => ({
      from: (_table: unknown) => {
        const joined = {
          leftJoin: (_a: unknown, _b: unknown) => joined,
          where: async (_w: unknown) => mockState.selectRows
        };

        return "inventory" in shape
          ? joined
          : {
            where: async (_w: unknown) => mockState.selectRows
          };
      }
    })
  };

  return {
    db,
    and: (...args: unknown[]) => args,
    asc: (v: unknown) => v,
    eq: (...args: unknown[]) => args,
    isNull: (v: unknown) => v,
    sql: (..._args: unknown[]) => ({}) as never,
    ingredientPackageVariants: tableRefs.ingredientPackageVariants,
    ingredients: tableRefs.ingredients,
    userCustomIngredients: tableRefs.userCustomIngredients,
    userIngredients: tableRefs.userIngredients
  };
});

import {
  addCatalogIngredientToInventory,
  addCustomIngredientToInventory,
  archiveInventoryItem,
  deleteInventoryItem,
  getInventorySummaries,
  listInventoryForUser,
  setInventoryItemQuantityToZero,
  updateInventoryQuantity
} from "../features/inventory/service";

const VALID_UUID = "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0";

// Полная форма каталожного солода (базовый фермент), достаточная для linkage/profile.
const maltCatalog = (id: string): Record<string, unknown> => ({
  id,
  isActive: true,
  type: "malt",
  itemKind: "malt",
  nameRu: null,
  nameEn: "Pilsner Malt",
  displayModeRu: "source_first",
  displayNameOverrideRu: null,
  secondaryNameOverrideRu: null,
  hideSecondaryNameRu: false,
  countryCode: null,
  countryName: null,
  brand: null,
  producer: null,
  productCode: null,
  groupName: null,
  category: null,
  subcategory: null,
  presentOnBirrf: true,
  inventoryEnabled: true,
  attributes: {},
  quantityDefaults: null
});

// Снимок позиции склада без живого каталога/кастома (snapshot-only строка).
const snapshotInventoryRow = (overrides: {
  id: string;
  ingredientCategory: string;
  ingredientSubtype: string;
  ingredientDisplayNameSnapshot: string;
  ingredientDefaultDisplayUnitSnapshot: string;
  ingredientMeasurementDimension: string;
  enteredUnit: string;
  normalizedUnit: string;
  enteredQuantity: number;
  normalizedQuantity: number;
  normalizedUnitCostMinorRub?: number | null;
  archivedAt?: Date | null;
}) => ({
  inventory: {
    id: overrides.id,
    userId: "u1",
    ingredientCatalogItemId: null,
    userCustomIngredientId: null,
    packageVariantId: null,
    ingredientFamilyId: null,
    ingredientCategory: overrides.ingredientCategory,
    ingredientSubtype: overrides.ingredientSubtype,
    ingredientDisplayNameSnapshot: overrides.ingredientDisplayNameSnapshot,
    ingredientDefaultDisplayUnitSnapshot: overrides.ingredientDefaultDisplayUnitSnapshot,
    ingredientMeasurementDimension: overrides.ingredientMeasurementDimension,
    enteredQuantity: overrides.enteredQuantity,
    enteredUnit: overrides.enteredUnit,
    normalizedQuantity: overrides.normalizedQuantity,
    normalizedUnit: overrides.normalizedUnit,
    unitDimension: overrides.ingredientMeasurementDimension,
    priceInputMode: null,
    priceInputAmountMinor: null,
    priceInputCurrency: null,
    purchasePriceMinor: null,
    purchaseCurrency: null,
    purchaseQuantity: null,
    purchaseQuantityUnit: null,
    purchaseQuantityNormalized: null,
    purchaseQuantityNormalizedUnit: null,
    normalizedUnitCostMinorRub: overrides.normalizedUnitCostMinorRub ?? null,
    properties: null,
    purchasedAt: null,
    freshnessDate: null,
    notes: null,
    archivedAt: overrides.archivedAt ?? null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01")
  },
  catalog: null,
  custom: null,
  packageVariant: null
});

describe("склад: операции над позициями (CRUD)", () => {
  beforeEach(() => {
    mockState.idCounter = 0;
    mockState.inserted = [];
    mockState.updates = [];
    mockState.deleted = [];
    mockState.selectRows = [];
    mockState.catalogFindFirst.mockReset();
    mockState.packageVariantFindFirst.mockReset();
    mockState.customFindFirst.mockReset();
    mockState.inventoryFindFirst.mockReset();
  });

  describe("журнал: жизненный цикл позиции", () => {
    it("проводит позицию: добавление → изменение количества → обнуление → архив → удаление", async () => {
      const catalog = maltCatalog("cat-cycle-1");

      // 1. Добавление каталожного солода (3 кг → 3000 г).
      mockState.catalogFindFirst.mockResolvedValueOnce(catalog);
      const created = await addCatalogIngredientToInventory("u1", {
        ingredientCatalogItemId: VALID_UUID,
        enteredQuantity: 3,
        enteredUnit: "kg"
      });
      expect(created.ingredientCatalogItemId).toBe("cat-cycle-1");
      expect(mockState.inserted).toHaveLength(1);
      expect(mockState.inserted[0]?.values).toMatchObject({
        enteredQuantity: 3,
        enteredUnit: "kg",
        normalizedQuantity: 3000,
        normalizedUnit: "g"
      });

      // 2. Изменение количества (1.5 кг → 1500 г).
      mockState.inventoryFindFirst.mockResolvedValueOnce({
        id: "inv-cycle",
        userId: "u1",
        ingredientCatalogItemId: "cat-cycle-1",
        userCustomIngredientId: null,
        ingredientCategory: "fermentable",
        ingredientSubtype: "malt",
        ingredientDefaultDisplayUnitSnapshot: "kg",
        ingredientMeasurementDimension: "weight",
        properties: null
      });
      mockState.catalogFindFirst.mockResolvedValueOnce(catalog);
      mockState.selectRows = [{
        inventory: {
          id: "inv-cycle",
          userId: "u1",
          ingredientCatalogItemId: "cat-cycle-1",
          userCustomIngredientId: null,
          packageVariantId: null,
          ingredientFamilyId: null,
          ingredientCategory: "fermentable",
          ingredientSubtype: "malt",
          ingredientDisplayNameSnapshot: "Pilsner Malt",
          ingredientDefaultDisplayUnitSnapshot: "kg",
          ingredientMeasurementDimension: "weight"
        },
        catalog,
        custom: null,
        packageVariant: null
      }];
      await updateInventoryQuantity("u1", "inv-cycle", { enteredQuantity: 1.5, enteredUnit: "kg" });
      expect(mockState.updates[0]?.set).toMatchObject({
        enteredQuantity: 1.5,
        enteredUnit: "kg",
        normalizedQuantity: 1500,
        normalizedUnit: "g"
      });

      // 3. Обнуление (позиция израсходована, но остаётся в журнале).
      mockState.inventoryFindFirst.mockResolvedValueOnce({ id: "inv-cycle", userId: "u1" });
      await setInventoryItemQuantityToZero("u1", "inv-cycle");
      expect(mockState.updates[1]?.set).toMatchObject({ enteredQuantity: 0, normalizedQuantity: 0 });

      // 4. Архивация.
      mockState.inventoryFindFirst.mockResolvedValueOnce({ id: "inv-cycle", userId: "u1" });
      await archiveInventoryItem("u1", "inv-cycle");
      expect(mockState.updates[2]?.set.archivedAt).toBeInstanceOf(Date);

      // 5. Удаление.
      mockState.inventoryFindFirst.mockResolvedValueOnce({ id: "inv-cycle", userId: "u1" });
      await deleteInventoryItem("u1", "inv-cycle");
      expect(mockState.deleted).toHaveLength(1);
      expect(mockState.deleted[0]?.table).toBe("userIngredients");
    });
  });

  describe("обнуление количества (setInventoryItemQuantityToZero)", () => {
    it("обнуляет количество, не трогая единицы измерения", async () => {
      mockState.inventoryFindFirst.mockResolvedValueOnce({ id: "inv-1", userId: "u1" });

      await setInventoryItemQuantityToZero("u1", "inv-1");

      const set = mockState.updates[0]?.set;
      expect(set).toMatchObject({ enteredQuantity: 0, normalizedQuantity: 0 });
      expect(set?.updatedAt).toBeInstanceOf(Date);
      // обнуление — это не пересчёт: единицы/нормализованная единица не меняются
      expect(set).not.toHaveProperty("enteredUnit");
      expect(set).not.toHaveProperty("normalizedUnit");
    });

    it("обнуление чужой позиции → NOT_FOUND, без записи в БД", async () => {
      mockState.inventoryFindFirst.mockResolvedValueOnce(null);

      await expect(setInventoryItemQuantityToZero("u1", "inv-foreign")).rejects.toThrowError("NOT_FOUND");
      expect(mockState.updates).toHaveLength(0);
    });
  });

  describe("гейты владельца", () => {
    it("архивация чужой позиции → NOT_FOUND, без записи", async () => {
      mockState.inventoryFindFirst.mockResolvedValueOnce(null);

      await expect(archiveInventoryItem("u1", "inv-foreign")).rejects.toThrowError("NOT_FOUND");
      expect(mockState.updates).toHaveLength(0);
    });

    it("удаление чужой позиции → NOT_FOUND, без удаления", async () => {
      mockState.inventoryFindFirst.mockResolvedValueOnce(null);

      await expect(deleteInventoryItem("u1", "inv-foreign")).rejects.toThrowError("NOT_FOUND");
      expect(mockState.deleted).toHaveLength(0);
    });
  });

  describe("граничные значения количества", () => {
    it("добавление с нулевым количеством отклоняется", async () => {
      await expect(addCatalogIngredientToInventory("u1", {
        ingredientCatalogItemId: VALID_UUID,
        enteredQuantity: 0,
        enteredUnit: "kg"
      })).rejects.toThrow();
      expect(mockState.inserted).toHaveLength(0);
    });

    it("добавление с отрицательным количеством отклоняется", async () => {
      await expect(addCatalogIngredientToInventory("u1", {
        ingredientCatalogItemId: VALID_UUID,
        enteredQuantity: -5,
        enteredUnit: "kg"
      })).rejects.toThrow();
      expect(mockState.inserted).toHaveLength(0);
    });

    it("изменение количества на отрицательное отклоняется (без записи)", async () => {
      mockState.inventoryFindFirst.mockResolvedValueOnce({
        id: "inv-1",
        userId: "u1",
        ingredientCategory: "fermentable",
        ingredientSubtype: "malt",
        ingredientDefaultDisplayUnitSnapshot: "kg",
        ingredientMeasurementDimension: "weight"
      });

      await expect(updateInventoryQuantity("u1", "inv-1", { enteredQuantity: -1, enteredUnit: "kg" })).rejects.toThrow();
      expect(mockState.updates).toHaveLength(0);
    });
  });

  describe("конверсии единиц при добавлении в склад", () => {
    it("переводит фунты в граммы (вес) при добавлении каталожного фермента", async () => {
      mockState.catalogFindFirst.mockResolvedValueOnce(maltCatalog("cat-lb"));

      await addCatalogIngredientToInventory("u1", {
        ingredientCatalogItemId: VALID_UUID,
        enteredQuantity: 2,
        enteredUnit: "lb"
      });

      expect(mockState.inserted[0]?.values).toMatchObject({
        enteredQuantity: 2,
        enteredUnit: "lb",
        normalizedQuantity: 907.185,
        normalizedUnit: "g",
        unitDimension: "weight"
      });
    });

    it("переводит литры в миллилитры (объём) при добавлении кислоты для воды", async () => {
      mockState.catalogFindFirst.mockResolvedValueOnce({
        id: "lactic-acid",
        isActive: true,
        type: "water_treatment",
        itemKind: "acid",
        nameRu: "Молочная кислота",
        nameEn: "Lactic Acid",
        displayModeRu: "localized_first",
        displayNameOverrideRu: null,
        secondaryNameOverrideRu: null,
        hideSecondaryNameRu: false,
        countryCode: null,
        countryName: null,
        brand: null,
        producer: null,
        productCode: null,
        groupName: null,
        category: "acid",
        subcategory: null,
        presentOnBirrf: true,
        inventoryEnabled: true,
        attributes: { unit_preferred: "ml" },
        quantityDefaults: null
      });

      await addCatalogIngredientToInventory("u1", {
        ingredientCatalogItemId: VALID_UUID,
        enteredQuantity: 1.5,
        enteredUnit: "l"
      });

      expect(mockState.inserted[0]?.values).toMatchObject({
        enteredQuantity: 1.5,
        enteredUnit: "l",
        normalizedQuantity: 1500,
        normalizedUnit: "ml",
        unitDimension: "volume"
      });
    });
  });

  describe("стоимость покупки и удельная цена", () => {
    it("считает удельную стоимость в копейках RUB для покупки в EUR", async () => {
      mockState.catalogFindFirst.mockResolvedValueOnce(maltCatalog("cat-eur"));

      await addCatalogIngredientToInventory("u1", {
        ingredientCatalogItemId: VALID_UUID,
        enteredQuantity: 2,
        enteredUnit: "kg",
        priceInputMode: "total",
        priceInputAmountMinor: 80000,
        priceInputCurrency: "EUR"
      });

      // convert(80000 EUR, rate 9170) = 7_336_000 коп. RUB; / 2000 г = 3668 коп./г
      expect(mockState.inserted[0]?.values).toMatchObject({
        priceInputMode: "total",
        priceInputAmountMinor: 80000,
        priceInputCurrency: "EUR",
        purchasePriceMinor: 80000,
        purchaseCurrency: "EUR",
        purchaseQuantity: 2,
        purchaseQuantityUnit: "kg",
        purchaseQuantityNormalized: 2000,
        purchaseQuantityNormalizedUnit: "g",
        normalizedUnitCostMinorRub: 3668
      });
    });

    it("указание валюты без цены покупки отклоняется (без записи)", async () => {
      await expect(addCatalogIngredientToInventory("u1", {
        ingredientCatalogItemId: VALID_UUID,
        enteredQuantity: 2,
        enteredUnit: "kg",
        priceInputCurrency: "USD"
      })).rejects.toThrow();
      expect(mockState.inserted).toHaveLength(0);
    });

    it("сохраняет стоимость при добавлении кастомного ингредиента в склад", async () => {
      mockState.customFindFirst.mockResolvedValueOnce({
        id: "custom-hop-1",
        userId: "u1",
        type: "hop",
        displayName: "Домашний Citra",
        manufacturer: "Local",
        country: null,
        properties: {
          category: "hop",
          subtype: "hop",
          brand: "Local",
          defaultDisplayUnit: "g",
          allowedUnits: ["g", "kg", "oz", "lb"],
          measurementDimension: "weight",
          technicalData: { type: "hop", alphaAcidPctTypical: 12 }
        }
      });

      await addCustomIngredientToInventory("u1", {
        userCustomIngredientId: VALID_UUID,
        enteredQuantity: 100,
        enteredUnit: "g",
        priceInputMode: "total",
        priceInputAmountMinor: 50000,
        priceInputCurrency: "EUR"
      });

      // convert(50000 EUR, rate 9170) = 4_585_000 коп. RUB; / 100 г = 45850 коп./г
      expect(mockState.inserted[0]?.table).toBe("userIngredients");
      expect(mockState.inserted[0]?.values).toMatchObject({
        userCustomIngredientId: "custom-hop-1",
        ingredientCategory: "hop",
        enteredQuantity: 100,
        enteredUnit: "g",
        normalizedQuantity: 100,
        normalizedUnit: "g",
        purchasePriceMinor: 50000,
        purchaseCurrency: "EUR",
        normalizedUnitCostMinorRub: 45850
      });
    });
  });

  describe("фильтры и сортировка списка", () => {
    it("stockState=empty возвращает только израсходованные позиции", async () => {
      mockState.selectRows = [
        snapshotInventoryRow({
          id: "inv-stock",
          ingredientCategory: "hop",
          ingredientSubtype: "hop",
          ingredientDisplayNameSnapshot: "Citra",
          ingredientDefaultDisplayUnitSnapshot: "g",
          ingredientMeasurementDimension: "weight",
          enteredUnit: "g",
          normalizedUnit: "g",
          enteredQuantity: 100,
          normalizedQuantity: 100
        }),
        snapshotInventoryRow({
          id: "inv-empty",
          ingredientCategory: "hop",
          ingredientSubtype: "hop",
          ingredientDisplayNameSnapshot: "Mosaic",
          ingredientDefaultDisplayUnitSnapshot: "g",
          ingredientMeasurementDimension: "weight",
          enteredUnit: "g",
          normalizedUnit: "g",
          enteredQuantity: 0,
          normalizedQuantity: 0
        })
      ];

      const items = await listInventoryForUser("u1", { stockState: "empty" });

      expect(items).toHaveLength(1);
      expect(items[0]?.ingredientDisplayNameSnapshot).toBe("Mosaic");
      expect(items[0]?.normalizedQuantity).toBe(0);
    });

    it("фильтрует список по типу ингредиента", async () => {
      mockState.selectRows = [
        snapshotInventoryRow({
          id: "inv-hop",
          ingredientCategory: "hop",
          ingredientSubtype: "hop",
          ingredientDisplayNameSnapshot: "Cascade Snapshot",
          ingredientDefaultDisplayUnitSnapshot: "g",
          ingredientMeasurementDimension: "weight",
          enteredUnit: "g",
          normalizedUnit: "g",
          enteredQuantity: 100,
          normalizedQuantity: 100
        }),
        snapshotInventoryRow({
          id: "inv-malt",
          ingredientCategory: "fermentable",
          ingredientSubtype: "malt",
          ingredientDisplayNameSnapshot: "Pilsner Snapshot",
          ingredientDefaultDisplayUnitSnapshot: "kg",
          ingredientMeasurementDimension: "weight",
          enteredUnit: "kg",
          normalizedUnit: "g",
          enteredQuantity: 1,
          normalizedQuantity: 1000
        })
      ];

      const hops = await listInventoryForUser("u1", { type: "hop" });

      expect(hops).toHaveLength(1);
      expect(hops[0]?.source.type).toBe("hop");
      expect(hops[0]?.ingredientDisplayNameSnapshot).toBe("Cascade Snapshot");
    });

    it("сортирует по количеству (по убыванию)", async () => {
      mockState.selectRows = [
        snapshotInventoryRow({
          id: "inv-small",
          ingredientCategory: "hop",
          ingredientSubtype: "hop",
          ingredientDisplayNameSnapshot: "Mало",
          ingredientDefaultDisplayUnitSnapshot: "g",
          ingredientMeasurementDimension: "weight",
          enteredUnit: "g",
          normalizedUnit: "g",
          enteredQuantity: 100,
          normalizedQuantity: 100
        }),
        snapshotInventoryRow({
          id: "inv-big",
          ingredientCategory: "hop",
          ingredientSubtype: "hop",
          ingredientDisplayNameSnapshot: "Много",
          ingredientDefaultDisplayUnitSnapshot: "g",
          ingredientMeasurementDimension: "weight",
          enteredUnit: "g",
          normalizedUnit: "g",
          enteredQuantity: 2000,
          normalizedQuantity: 2000
        })
      ];

      const items = await listInventoryForUser("u1", { sort: "quantity" });

      expect(items.map((item) => item.normalizedQuantity)).toEqual([2000, 100]);
    });

    it("сортирует по удельной цене (по убыванию)", async () => {
      mockState.selectRows = [
        snapshotInventoryRow({
          id: "inv-cheap",
          ingredientCategory: "hop",
          ingredientSubtype: "hop",
          ingredientDisplayNameSnapshot: "Дёшево",
          ingredientDefaultDisplayUnitSnapshot: "g",
          ingredientMeasurementDimension: "weight",
          enteredUnit: "g",
          normalizedUnit: "g",
          enteredQuantity: 100,
          normalizedQuantity: 100,
          normalizedUnitCostMinorRub: 50
        }),
        snapshotInventoryRow({
          id: "inv-pricey",
          ingredientCategory: "hop",
          ingredientSubtype: "hop",
          ingredientDisplayNameSnapshot: "Дорого",
          ingredientDefaultDisplayUnitSnapshot: "g",
          ingredientMeasurementDimension: "weight",
          enteredUnit: "g",
          normalizedUnit: "g",
          enteredQuantity: 100,
          normalizedQuantity: 100,
          normalizedUnitCostMinorRub: 200
        })
      ];

      const items = await listInventoryForUser("u1", { sort: "price" });

      expect(items.map((item) => item.normalizedUnitCostMinorRub)).toEqual([200, 50]);
    });
  });

  describe("сводки склада (getInventorySummaries)", () => {
    it("исключает архивные позиции и считает подтип фермента (солод)", async () => {
      mockState.selectRows = [
        snapshotInventoryRow({
          id: "inv-malt",
          ingredientCategory: "fermentable",
          ingredientSubtype: "malt",
          ingredientDisplayNameSnapshot: "Pilsner",
          ingredientDefaultDisplayUnitSnapshot: "kg",
          ingredientMeasurementDimension: "weight",
          enteredUnit: "kg",
          normalizedUnit: "g",
          enteredQuantity: 1.5,
          normalizedQuantity: 1500
        }),
        snapshotInventoryRow({
          id: "inv-hop-empty",
          ingredientCategory: "hop",
          ingredientSubtype: "hop",
          ingredientDisplayNameSnapshot: "Citra",
          ingredientDefaultDisplayUnitSnapshot: "g",
          ingredientMeasurementDimension: "weight",
          enteredUnit: "g",
          normalizedUnit: "g",
          enteredQuantity: 0,
          normalizedQuantity: 0
        }),
        snapshotInventoryRow({
          id: "inv-archived",
          ingredientCategory: "consumable",
          ingredientSubtype: "fining",
          ingredientDisplayNameSnapshot: "Whirlfloc",
          ingredientDefaultDisplayUnitSnapshot: "item",
          ingredientMeasurementDimension: "count",
          enteredUnit: "item",
          normalizedUnit: "item",
          enteredQuantity: 50,
          normalizedQuantity: 50,
          archivedAt: new Date("2025-02-01")
        })
      ];

      const summary = await getInventorySummaries("u1");

      // архивная позиция исключена полностью
      expect(summary.totalItems).toBe(2);
      expect(summary.inStockItems).toBe(1);
      expect(summary.emptyItems).toBe(1);
      expect(summary.byCategory.fermentable).toBe(1);
      expect(summary.byCategory.hop).toBe(1);
      expect(summary.byCategory.consumable).toBe(0);
      expect(summary.inStockByCategory.fermentable).toBe(1);
      expect(summary.inStockByCategory.hop).toBe(0);
      // подтип фермента: солод
      expect(summary.byFermentableSubtype.malt).toBe(1);
      expect(summary.inStockByFermentableSubtype.malt).toBe(1);
      expect(summary.byFermentableSubtype.fermentable).toBe(0);
    });
  });
});
