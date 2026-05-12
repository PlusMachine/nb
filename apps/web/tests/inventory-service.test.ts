import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { inventorySourceLinkageSchema } from "../features/inventory/contracts";
import {
  addCatalogIngredientToInventory,
  addCustomIngredientToInventory,
  archiveInventoryItem,
  createUserCustomIngredient,
  deleteInventoryItem,
  getInventorySummaries,
  listInventoryForUser,
  resolveCatalogInventoryAdditionSource,
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
    mockState.packageVariantFindFirst.mockReset();
    mockState.customFindFirst.mockReset();
    mockState.inventoryFindFirst.mockReset();
  });

  it("creates user custom ingredient with normalized name", async () => {
    const created = await createUserCustomIngredient("u1", {
      category: "hop",
      displayName: "  Citra, T-90  ",
      brand: "Yakima Chief",
      hopAlphaAcidPct: 12.5,
      harvestYear: 2024
    });

    expect(created.displayName).toBe("Citra, T-90");
    expect(created.normalizedName).toBe("citra t 90");
    expect(mockState.inserted[0]?.table).toBe("userCustomIngredients");
    expect(mockState.inserted[0]?.values).toMatchObject({
      manufacturer: "Yakima Chief",
      hopAlphaAcidPct: 12.5,
      hopSeason: "2024"
    });
    expect(mockState.inserted[0]?.values.properties).toMatchObject({
      category: "hop",
      subtype: "hop",
      brand: "Yakima Chief",
      harvestYear: 2024,
      defaultDisplayUnit: "g",
      technicalData: {
        type: "hop",
        alphaAcidPctTypical: 12.5
      }
    });
  });

  it("stores water treatment acid concentration on custom ingredients", async () => {
    const created = await createUserCustomIngredient("u1", {
      category: "water_treatment",
      subtype: "acid",
      displayName: "Молочная кислота",
      waterTreatmentConcentrationPct: 75,
      defaultDisplayUnit: "ml"
    });

    expect(created.displayName).toBe("Молочная кислота");
    expect(mockState.inserted[0]?.values.properties).toMatchObject({
      category: "water_treatment",
      subtype: "acid",
      concentration: "75%",
      waterTreatmentConcentrationPct: 75,
      technicalData: {
        type: "water_treatment",
        concentrationPct: 75,
        displayFormula: "75%"
      }
    });
  });

  it("creates a derived fermentable custom ingredient when catalog batch parameters differ", async () => {
    const catalogItem = {
      id: "cat-malt-1",
      isActive: true,
      type: "malt",
      itemKind: "malt",
      nameRu: "Пилснер",
      nameEn: "Pilsner Malt",
      displayModeRu: "localized_first",
      displayNameOverrideRu: null,
      secondaryNameOverrideRu: null,
      hideSecondaryNameRu: false,
      countryCode: "DE",
      countryName: "Германия",
      brand: "BESTMALZ",
      producer: "BESTMALZ",
      productCode: "PILS",
      groupName: null,
      category: null,
      subcategory: null,
      presentOnBirrf: true,
      inventoryEnabled: true,
      attributes: {
        extract_pct_dry_basis: 81,
        color_ebc_min: 5,
        color_ebc_max: 5,
        color_lovibond: 2.54,
        malt_type: "base"
      },
      quantityDefaults: null
    };
    mockState.catalogFindFirst.mockResolvedValueOnce(catalogItem);
    mockState.customFindFirst.mockResolvedValueOnce(null);

    const resolved = await resolveCatalogInventoryAdditionSource("u1", {
      ingredientCatalogItemId: "cat-malt-1",
      fermentableColorEbc: 6.5,
      fermentableExtractYieldPct: 82
    });

    expect(resolved).toMatchObject({
      sourceKind: "custom"
    });
    expect(mockState.inserted[0]?.table).toBe("userCustomIngredients");
    expect(mockState.inserted[0]?.values).toMatchObject({
      type: "malt",
      displayName: "Пилснер",
      manufacturer: "BESTMALZ",
      fermentableColorEbc: 6.5,
      fermentableExtractYieldPct: 82
    });
    expect(mockState.inserted[0]?.values.properties).toMatchObject({
      derivedFromIngredientId: "cat-malt-1",
      derivedFromDisplayName: "Пилснер",
      technicalData: {
        type: "malt",
        extractPctDryBasis: 82
      }
    });
    expect(catalogItem.attributes).toEqual({
      extract_pct_dry_basis: 81,
      color_ebc_min: 5,
      color_ebc_max: 5,
      color_lovibond: 2.54,
      malt_type: "base"
    });
  });

  it("creates a derived hop custom ingredient when alpha acid differs", async () => {
    mockState.catalogFindFirst.mockResolvedValueOnce({
      id: "cat-hop-1",
      isActive: true,
      type: "hop",
      itemKind: "hop",
      nameRu: "Цитра",
      nameEn: "Citra",
      displayModeRu: "localized_first",
      displayNameOverrideRu: null,
      secondaryNameOverrideRu: null,
      hideSecondaryNameRu: false,
      countryCode: "US",
      countryName: "США",
      brand: "Yakima Chief",
      producer: "Yakima Chief",
      productCode: null,
      groupName: null,
      category: null,
      subcategory: null,
      presentOnBirrf: true,
      inventoryEnabled: true,
      attributes: {
        alpha_acid_pct_typical: 12,
        beta_acid_pct_typical: 3.8,
        hop_form: "pellet"
      },
      quantityDefaults: null
    });
    mockState.customFindFirst.mockResolvedValueOnce(null);

    const resolved = await resolveCatalogInventoryAdditionSource("u1", {
      ingredientCatalogItemId: "cat-hop-1",
      hopAlphaAcidPct: 13.2
    });

    expect(resolved).toMatchObject({
      sourceKind: "custom"
    });
    expect(mockState.inserted[0]?.values).toMatchObject({
      type: "hop",
      displayName: "Цитра",
      hopAlphaAcidPct: 13.2,
      hopForm: "pellet"
    });
    expect(mockState.inserted[0]?.values.properties).toMatchObject({
      derivedFromIngredientId: "cat-hop-1",
      technicalData: {
        type: "hop",
        alphaAcidPctTypical: 13.2,
        betaAcidPctTypical: 3.8,
        hopForm: "pellet"
      }
    });
  });

  it("keeps catalog water acid source when concentration differs", async () => {
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
      category: null,
      subcategory: null,
      presentOnBirrf: true,
      inventoryEnabled: true,
      attributes: {
        display_formula: "88%",
        default_concentration_pct: 88,
        unit_preferred: "ml",
        common_forms: ["solution"]
      },
      quantityDefaults: null
    });
    const resolved = await resolveCatalogInventoryAdditionSource("u1", {
      ingredientCatalogItemId: "lactic-acid",
      waterTreatmentConcentrationPct: 75
    });

    expect(resolved).toEqual({
      sourceKind: "catalog",
      ingredientCatalogItemId: "lactic-acid"
    });
    expect(mockState.inserted).toHaveLength(0);
  });

  it("keeps the original catalog source when override values match the catalog", async () => {
    mockState.catalogFindFirst.mockResolvedValueOnce({
      id: "cat-hop-2",
      isActive: true,
      type: "hop",
      itemKind: "hop",
      nameRu: "Мозаик",
      nameEn: "Mosaic",
      displayModeRu: "localized_first",
      displayNameOverrideRu: null,
      secondaryNameOverrideRu: null,
      hideSecondaryNameRu: false,
      countryCode: "US",
      countryName: "США",
      brand: "Yakima Chief",
      producer: "Yakima Chief",
      productCode: null,
      groupName: null,
      category: null,
      subcategory: null,
      presentOnBirrf: true,
      inventoryEnabled: true,
      attributes: {
        alpha_acid_pct_typical: 12
      },
      quantityDefaults: null
    });

    const resolved = await resolveCatalogInventoryAdditionSource("u1", {
      ingredientCatalogItemId: "cat-hop-2",
      hopAlphaAcidPct: 12
    });

    expect(resolved).toEqual({
      sourceKind: "catalog",
      ingredientCatalogItemId: "cat-hop-2"
    });
    expect(mockState.inserted).toHaveLength(0);
  });

  it("keeps catalog water acid source when concentration matches the catalog", async () => {
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
      category: null,
      subcategory: null,
      presentOnBirrf: true,
      inventoryEnabled: true,
      attributes: {
        default_concentration_pct: 88,
        display_formula: "88%"
      },
      quantityDefaults: null
    });

    const resolved = await resolveCatalogInventoryAdditionSource("u1", {
      ingredientCatalogItemId: "lactic-acid",
      waterTreatmentConcentrationPct: 88
    });

    expect(resolved).toEqual({
      sourceKind: "catalog",
      ingredientCatalogItemId: "lactic-acid"
    });
    expect(mockState.inserted).toHaveLength(0);
  });

  it("keeps the original catalog source when UI-rounded fermentable values match the catalog", async () => {
    mockState.catalogFindFirst.mockResolvedValueOnce({
      id: "cat-malt-2",
      isActive: true,
      type: "malt",
      itemKind: "malt",
      nameRu: "Пилснер Премиум",
      nameEn: "Pilsner Premium",
      displayModeRu: "localized_first",
      displayNameOverrideRu: null,
      secondaryNameOverrideRu: null,
      hideSecondaryNameRu: false,
      countryCode: "RU",
      countryName: "Россия",
      brand: "Курский солод",
      producer: "Курский солод",
      productCode: null,
      groupName: null,
      category: null,
      subcategory: null,
      presentOnBirrf: true,
      inventoryEnabled: true,
      attributes: {
        extract_pct_dry_basis: 83,
        color_ebc_min: 3.7065,
        color_ebc_max: 3.7065,
        malt_type: "base"
      },
      quantityDefaults: null
    });

    const resolved = await resolveCatalogInventoryAdditionSource("u1", {
      ingredientCatalogItemId: "cat-malt-2",
      fermentableColorEbc: 3.71,
      fermentableExtractYieldPct: 83
    });

    expect(resolved).toEqual({
      sourceKind: "catalog",
      ingredientCatalogItemId: "cat-malt-2"
    });
    expect(mockState.inserted).toHaveLength(0);
  });

  it("adds catalog ingredient to inventory", async () => {
    mockState.catalogFindFirst.mockResolvedValueOnce({
      id: "cat-1",
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
    mockState.selectRows = [{
      inventory: {
        id: "inv-1",
        userId: "u1",
        ingredientCatalogItemId: "cat-1",
        userCustomIngredientId: null,
        packageVariantId: null,
        ingredientFamilyId: null,
        ingredientCategory: "fermentable",
        ingredientSubtype: "malt",
        ingredientDisplayNameSnapshot: "Pilsner Malt",
        ingredientDefaultDisplayUnitSnapshot: "kg",
        ingredientMeasurementDimension: "weight"
      },
      catalog: {
        id: "cat-1",
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
      },
      custom: null,
      packageVariant: null
    }];
    mockState.selectRows = [{
      inventory: {
        id: "inv-1",
        userId: "u1",
        ingredientCatalogItemId: "cat-1",
        userCustomIngredientId: null,
        packageVariantId: null,
        ingredientFamilyId: null,
        ingredientCategory: "hop",
        ingredientSubtype: "hop",
        ingredientDisplayNameSnapshot: "Cascade",
        ingredientDefaultDisplayUnitSnapshot: "g",
        ingredientMeasurementDimension: "weight"
      },
      catalog: {
        id: "cat-1",
        isActive: true,
        type: "hop",
        itemKind: "hop",
        nameRu: null,
        nameEn: "Cascade",
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
      },
      custom: null,
      packageVariant: null
    }];

    const created = await addCatalogIngredientToInventory("u1", {
      ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      enteredQuantity: 2,
      enteredUnit: "kg"
    });

    expect(created.ingredientCatalogItemId).toBe("cat-1");
    expect(mockState.inserted[0]?.values).toMatchObject({
      userId: "u1",
      ingredientFamilyId: null,
      ingredientCategory: "fermentable",
      ingredientSubtype: "malt",
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

  it("stores water acid concentration as an inventory item property", async () => {
    mockState.catalogFindFirst.mockResolvedValueOnce({
      id: "lactic-acid",
      isActive: true,
      type: "water_treatment",
      itemKind: "lactic_acid",
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
      category: "кислоты",
      subcategory: null,
      presentOnBirrf: true,
      inventoryEnabled: true,
      attributes: {
        default_concentration_pct: 88,
        display_formula: "88%",
        unit_preferred: "ml"
      },
      quantityDefaults: null
    });

    await addCatalogIngredientToInventory("u1", {
      ingredientCatalogItemId: "lactic-acid",
      enteredQuantity: 250,
      enteredUnit: "ml",
      waterTreatmentConcentrationPct: 75
    });

    expect(mockState.inserted[0]?.values).toMatchObject({
      ingredientCatalogItemId: "lactic-acid",
      userCustomIngredientId: null,
      ingredientCategory: "water_treatment",
      properties: {
        waterTreatmentConcentrationPct: 75
      }
    });
  });

  it("adds custom ingredient to inventory with ownership check", async () => {
    mockState.customFindFirst.mockResolvedValueOnce({
      id: "custom-1",
      userId: "u1",
      type: "yeast",
      displayName: "House Lager",
      properties: {
        category: "yeast",
        subtype: "lager",
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
      ingredientSubtype: "yeast",
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

  it("normalizes dry yeast packs into gram stock by default", async () => {
    mockState.catalogFindFirst.mockResolvedValueOnce({
      id: "cat-yeast-1",
      isActive: true,
      type: "yeast",
      itemKind: "yeast",
      nameRu: "US-05",
      nameEn: "US-05",
      displayModeRu: "source_first",
      displayNameOverrideRu: null,
      secondaryNameOverrideRu: null,
      hideSecondaryNameRu: false,
      countryCode: null,
      countryName: null,
      brand: "Fermentis",
      producer: null,
      productCode: "US-05",
      groupName: null,
      category: null,
      subcategory: null,
      presentOnBirrf: true,
      inventoryEnabled: true,
      attributes: {
        form: "dry",
        attenuation_pct_typical: 78
      },
      quantityDefaults: null
    });

    await addCatalogIngredientToInventory("u1", {
      ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      enteredQuantity: 2,
      enteredUnit: "pack"
    });

    expect(mockState.inserted[0]?.values).toMatchObject({
      ingredientCategory: "yeast",
      ingredientSubtype: "yeast",
      ingredientDisplayNameSnapshot: "US-05",
      ingredientDefaultDisplayUnitSnapshot: "pack",
      ingredientMeasurementDimension: "count",
      enteredQuantity: 2,
      enteredUnit: "pack",
      normalizedQuantity: 22,
      normalizedUnit: "g",
      unitDimension: "weight"
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
      ingredientSubtype: "hop",
      ingredientDefaultDisplayUnitSnapshot: "g",
      ingredientMeasurementDimension: "weight"
    });
    mockState.catalogFindFirst.mockResolvedValueOnce({
      id: "cat-1",
      isActive: true,
      type: "hop",
      itemKind: "hop",
      nameRu: null,
      nameEn: "Cascade",
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
    mockState.selectRows = [{
      inventory: {
        id: "inv-1",
        userId: "u1",
        ingredientCatalogItemId: "cat-1",
        userCustomIngredientId: null,
        packageVariantId: null,
        ingredientFamilyId: null,
        ingredientCategory: "fermentable",
        ingredientSubtype: "malt",
        ingredientDisplayNameSnapshot: "Pilsner Malt",
        ingredientDefaultDisplayUnitSnapshot: "kg",
        ingredientMeasurementDimension: "weight"
      },
      catalog: {
        id: "cat-1",
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
      },
      custom: null,
      packageVariant: null
    }];

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
      ingredientSubtype: "malt",
      ingredientDefaultDisplayUnitSnapshot: "kg",
      ingredientMeasurementDimension: "weight"
    });
    mockState.catalogFindFirst.mockResolvedValueOnce({
      id: "cat-2",
      isActive: true,
      type: "malt",
      itemKind: "malt",
      nameRu: null,
      nameEn: "Maris Otter",
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
      ingredientCatalogItemId: "cat-2",
      userCustomIngredientId: null,
      ingredientCategory: "fermentable",
      ingredientSubtype: "malt",
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
      presentOnBirrf: null,
      inventoryEnabled: true,
      attributes: { unit_preferred: "ml" },
      quantityDefaults: null
    });

    await expect(addCatalogIngredientToInventory("u1", {
      ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      enteredQuantity: 1,
      enteredUnit: "pack"
    })).rejects.toThrowError("INCOMPATIBLE_UNIT");
  });

  it("stores purchase context and derives it from the entered amount when only price is provided", async () => {
    mockState.catalogFindFirst.mockResolvedValueOnce({
      id: "cat-1",
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

    await addCatalogIngredientToInventory("u1", {
      ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      enteredQuantity: 5,
      enteredUnit: "kg",
      priceInputMode: "total",
      priceInputAmountMinor: 125000
    }, { preferredCurrency: "USD" });

    expect(mockState.inserted[0]?.values).toMatchObject({
      priceInputMode: "total",
      priceInputAmountMinor: 125000,
      priceInputCurrency: "USD",
      purchasePriceMinor: 125000,
      purchaseCurrency: "USD",
      purchaseQuantity: 5,
      purchaseQuantityUnit: "kg",
      purchaseQuantityNormalized: 5000,
      purchaseQuantityNormalizedUnit: "g",
      normalizedUnitCostMinorRub: 1975
    });
  });

  it("derives total purchase price from per-display-unit input", async () => {
    mockState.catalogFindFirst.mockResolvedValueOnce({
      id: "cat-1",
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

    await addCatalogIngredientToInventory("u1", {
      ingredientCatalogItemId: "3d6eb945-8e2e-4af9-8d24-ef6c883b5dd0",
      enteredQuantity: 250,
      enteredUnit: "g",
      priceInputMode: "per_display_unit",
      priceInputAmountMinor: 12000
    }, { preferredCurrency: "RUB" });

    expect(mockState.inserted[0]?.values).toMatchObject({
      priceInputMode: "per_display_unit",
      priceInputAmountMinor: 12000,
      priceInputCurrency: "RUB",
      purchasePriceMinor: 3000000,
      purchaseCurrency: "RUB",
      purchaseQuantity: 250,
      purchaseQuantityUnit: "g",
      purchaseQuantityNormalized: 250,
      purchaseQuantityNormalizedUnit: "g",
      normalizedUnitCostMinorRub: 12000
    });
  });

  it("archives inventory item", async () => {
    mockState.inventoryFindFirst.mockResolvedValueOnce({ id: "inv-1", userId: "u1" });

    await archiveInventoryItem("u1", "inv-1");

    expect(mockState.updates[0]?.set.archivedAt).toBeInstanceOf(Date);
  });

  it("allows zero quantity through the standard quantity update path", async () => {
    mockState.inventoryFindFirst.mockResolvedValueOnce({
      id: "inv-1",
      userId: "u1",
      ingredientCatalogItemId: "cat-1",
      userCustomIngredientId: null,
      ingredientCategory: "fermentable",
      ingredientSubtype: "malt",
      ingredientDefaultDisplayUnitSnapshot: "kg",
      ingredientMeasurementDimension: "weight"
    });
    mockState.catalogFindFirst.mockResolvedValueOnce({
      id: "cat-1",
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
    mockState.selectRows = [{
      inventory: {
        id: "inv-1",
        userId: "u1",
        ingredientCatalogItemId: "cat-1",
        userCustomIngredientId: null,
        packageVariantId: null,
        ingredientFamilyId: null,
        ingredientCategory: "fermentable",
        ingredientSubtype: "malt",
        ingredientDisplayNameSnapshot: "Pilsner Malt",
        ingredientDefaultDisplayUnitSnapshot: "kg",
        ingredientMeasurementDimension: "weight"
      },
      catalog: {
        id: "cat-1",
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
      },
      custom: null,
      packageVariant: null
    }];

    await updateInventoryQuantity("u1", "inv-1", { enteredQuantity: 0, enteredUnit: "kg" });

    expect(mockState.updates[0]?.set).toMatchObject({
      enteredQuantity: 0,
      enteredUnit: "kg",
      normalizedQuantity: 0,
      normalizedUnit: "g"
    });
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
          priceInputMode: "total",
          priceInputAmountMinor: 45000,
          priceInputCurrency: "RUB",
          purchasedAt: null,
          freshnessDate: null,
          notes: null,
          archivedAt: null,
          createdAt: new Date("2025-01-01"),
          updatedAt: new Date("2025-01-01")
        },
        catalog: {
          id: "cat-1",
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
          countryName: "DE",
          brand: null,
          producer: "BESTMALZ",
          productCode: null,
          groupName: null,
          category: null,
          subcategory: null,
          presentOnBirrf: true,
          inventoryEnabled: true,
          attributes: { color_lovibond: 3.5, extract_pct_dry_basis: 80 },
          quantityDefaults: null
        },
        custom: null,
        packageVariant: null
      }
    ];

    const items = await listInventoryForUser("u1");

    expect(items).toHaveLength(1);
    expect(items[0]?.source.sourceKind).toBe("catalog");
    expect(items[0]).toMatchObject({
      ingredientFamilyId: "fam-1",
      ingredientCategory: "fermentable",
      ingredientSubtype: "malt",
      ingredientDisplayNameSnapshot: "Pilsner Malt",
      ingredientDefaultDisplayUnitSnapshot: "kg",
      ingredientMeasurementDimension: "weight",
      priceInputMode: "total",
      priceInputAmountMinor: 45000,
      priceInputCurrency: "RUB",
      enteredQuantity: 2,
      enteredUnit: "kg",
      normalizedQuantity: 2000,
      normalizedUnit: "g",
      unitDimension: "weight"
    });
    expect(items[0]?.source).toMatchObject({
      manufacturer: "BESTMALZ",
      country: "DE",
      fermentableColorLovibond: 3.5,
      fermentableExtractYieldPct: 80
    });
  });

  it("filters inventory by final category and include-empty toggle", async () => {
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
          updatedAt: new Date("2025-01-02")
        },
        catalog: {
          id: "cat-1",
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
        },
        custom: null,
        packageVariant: null
      },
      {
        inventory: {
          id: "inv-2",
          ingredientCatalogItemId: null,
          userCustomIngredientId: "custom-1",
          ingredientFamilyId: null,
          ingredientCategory: "consumable",
          ingredientSubtype: "fining",
          ingredientDisplayNameSnapshot: "Whirlfloc Tablet",
          ingredientDefaultDisplayUnitSnapshot: "item",
          ingredientMeasurementDimension: "count",
          enteredQuantity: 0,
          enteredUnit: "item",
          normalizedQuantity: 0,
          normalizedUnit: "item",
          unitDimension: "count",
          purchasedAt: null,
          freshnessDate: null,
          notes: null,
          archivedAt: null,
          createdAt: new Date("2025-01-03"),
          updatedAt: new Date("2025-01-04")
        },
        catalog: null,
        custom: {
          id: "custom-1",
          type: "consumable",
          displayName: "Whirlfloc Tablet",
          normalizedName: "whirlfloc tablet",
          manufacturer: "Brewferm",
          country: null,
          fermentableColorEbc: null,
          fermentableExtractYieldPct: null,
          hopAlphaAcidPct: null,
          hopForm: null,
          hopSeason: null,
          yeastAttenuationPct: null,
          yeastType: null,
          yeastForm: null,
          yeastMinFermentationTempC: null,
          yeastMaxFermentationTempC: null,
          properties: {
            category: "consumable",
            subtype: "fining",
            brand: "Brewferm",
            defaultDisplayUnit: "item",
            allowedUnits: ["item"],
            measurementDimension: "count",
            technicalData: {
              type: "consumable"
            }
          }
        },
        packageVariant: null
      }
    ];

    const inStockFermentables = await listInventoryForUser("u1", {
      category: "fermentable",
      includeEmpty: false
    });
    const emptyItems = await listInventoryForUser("u1", {
      includeEmpty: true
    });

    expect(inStockFermentables).toHaveLength(1);
    expect(inStockFermentables[0]?.ingredientCategory).toBe("fermentable");
    expect(emptyItems).toHaveLength(2);
    expect(emptyItems.some((item) => item.ingredientDisplayNameSnapshot === "Whirlfloc Tablet")).toBe(true);
    const customItem = emptyItems.find((item) => item.userCustomIngredientId === "custom-1");
    expect(customItem?.source.subtype).toBe("technical_additives");
    expect(customItem?.source.brand).toBe("Brewferm");
  });

  it("keeps catalog brand and country code metadata on inventory cards", async () => {
    mockState.selectRows = [
      {
        inventory: {
          id: "inv-1",
          ingredientCatalogItemId: "cat-1",
          userCustomIngredientId: null,
          ingredientFamilyId: "fam-1",
          ingredientCategory: "fermentable",
          ingredientSubtype: "base_malt",
          ingredientDisplayNameSnapshot: "Abbey Malt",
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
          createdAt: new Date("2025-01-01"),
          updatedAt: new Date("2025-01-02")
        },
        catalog: {
          id: "cat-1",
          isActive: true,
          type: "malt",
          itemKind: "malt",
          nameRu: "Аббатский солод",
          nameEn: "Abbey Malt",
          displayModeRu: "localized_first",
          displayNameOverrideRu: null,
          secondaryNameOverrideRu: null,
          hideSecondaryNameRu: false,
          countryCode: "BE",
          countryName: "Бельгия",
          brand: "Castle Malting",
          producer: null,
          productCode: null,
          groupName: null,
          category: null,
          subcategory: null,
          presentOnBirrf: true,
          inventoryEnabled: true,
          attributes: { color_lovibond: 18 },
          quantityDefaults: null
        },
        custom: null,
        packageVariant: null
      }
    ];

    const items = await listInventoryForUser("u1");

    expect(items).toHaveLength(1);
    expect(items[0]?.source).toMatchObject({
      brand: "Castle Malting",
      brandName: "Castle Malting",
      countryCode: "BE",
      countryName: "Бельгия",
      country: "Бельгия"
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
      ingredientSubtype: "hop",
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
        },
        custom: null,
        packageVariant: null
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
        },
        custom: null,
        packageVariant: null
      }
    ];

    const items = await searchInventorySuggestions("u1", { q: "Pils", category: "fermentable", limit: 8 });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "cat-1",
      displayName: "Pilsner Malt",
      source: "catalog"
    });
    expect(items[0]?.subtitle).toBe("");
  });

  it("builds summaries", async () => {
    mockState.selectRows = [
      {
        inventory: {
          id: "inv-hop-1",
          userId: "u1",
          ingredientCatalogItemId: "cat-hop-1",
          userCustomIngredientId: null,
          ingredientFamilyId: null,
          ingredientCategory: "hop",
          ingredientSubtype: "hop",
          ingredientDisplayNameSnapshot: "Citra",
          ingredientDefaultDisplayUnitSnapshot: "g",
          ingredientMeasurementDimension: "weight",
          enteredQuantity: 120,
          enteredUnit: "g",
          normalizedQuantity: 120,
          normalizedUnit: "g",
          unitDimension: "weight",
          priceInputMode: null,
          priceInputAmountMinor: null,
          priceInputCurrency: null,
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
          packageVariantId: null,
          createdAt: new Date("2025-01-01"),
          updatedAt: new Date("2025-01-01")
        },
        catalog: null,
        custom: null,
        packageVariant: null
      },
      {
        inventory: {
          id: "inv-consumable-1",
          userId: "u1",
          ingredientCatalogItemId: null,
          userCustomIngredientId: "cus-consumable-1",
          ingredientFamilyId: null,
          ingredientCategory: "consumable",
          ingredientSubtype: "fining",
          ingredientDisplayNameSnapshot: "Irish Moss",
          ingredientDefaultDisplayUnitSnapshot: "g",
          ingredientMeasurementDimension: "weight",
          enteredQuantity: 0,
          enteredUnit: "g",
          normalizedQuantity: 0,
          normalizedUnit: "g",
          unitDimension: "weight",
          priceInputMode: null,
          priceInputAmountMinor: null,
          priceInputCurrency: null,
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
          packageVariantId: null,
          createdAt: new Date("2025-01-02"),
          updatedAt: new Date("2025-01-02")
        },
        catalog: null,
        custom: null,
        packageVariant: null
      }
    ];

    const summary = await getInventorySummaries("u1");

    expect(summary.totalItems).toBe(2);
    expect(summary.inStockItems).toBe(1);
    expect(summary.emptyItems).toBe(1);
    expect(summary.byCategory.hop).toBe(1);
    expect(summary.byCategory.consumable).toBe(1);
    expect(summary.inStockByCategory.hop).toBe(1);
    expect(summary.inStockByCategory.consumable).toBe(0);
    expect(summary.byPrimaryGroup.hop).toBe(1);
    expect(summary.byPrimaryGroup.consumable_additive).toBe(1);
    expect(summary.inStockByPrimaryGroup.consumable_additive).toBe(0);
  });
});
