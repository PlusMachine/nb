import { beforeEach, describe, expect, it, vi } from "vitest";

const now = new Date("2026-03-27T10:00:00.000Z");

const mockState = vi.hoisted(() => ({
  catalogItems: [] as any[],
  customItems: [] as any[],
  favoriteKeys: new Set<string>()
}));

const buildCatalogItem = (overrides: Record<string, unknown> = {}) => ({
  id: "ingredient-1",
  type: "fermentable",
  category: "fermentable",
  subtype: "malt",
  familyId: null,
  family: null,
  primaryLabelRu: "Pilsner 2RS",
  secondaryLabelRu: "Pilsner Malt",
  displayName: "Pilsner 2RS",
  displayNameRu: "Pilsner 2RS",
  displayNameEn: "Pilsner Malt",
  nameRu: "Pilsner 2RS",
  nameEn: "Pilsner Malt",
  displayModeRu: "source_first",
  displayNameOverrideRu: null,
  secondaryNameOverrideRu: null,
  hideSecondaryNameRu: false,
  brand: "Castle Malting",
  producer: "Castle Malting",
  brandName: "Castle Malting",
  manufacturer: "Castle Malting",
  country: "Belgium",
  countryCode: "BE",
  countryName: "Belgium",
  productCode: null,
  groupName: null,
  sourceCategory: null,
  subcategory: null,
  itemKind: "malt",
  presentOnBirrf: true,
  isActive: true,
  inventoryEnabled: true,
  attributes: {},
  technicalData: {
    type: "malt",
    extractPctDryBasis: 81,
    colorLovibond: 1.6
  },
  aliases: [],
  sources: [],
  packageVariants: [],
  quantityDefaults: null,
  unitPreferred: null,
  defaultUnit: "kg",
  defaultDisplayUnit: "kg",
  allowedUnits: ["kg", "g"],
  measurementDimension: "mass",
  completenessLevel: "canonical",
  status: "active",
  visibility: "public",
  mergedIntoId: null,
  createdAt: now,
  updatedAt: now,
  ...overrides
});

const buildCustomIngredientRow = (overrides: Record<string, unknown> = {}) => {
  const overrideProperties = (overrides.properties as Record<string, unknown> | undefined) ?? {};
  const baseProperties = {
    category: "fermentable",
    subtype: "malt",
    nameEn: "Custom Pilsner",
    aliases: []
  };
  const baseRow = {
    id: "custom-ingredient-1",
    userId: "user-1",
    type: "fermentable",
    displayName: "Custom Pilsner",
    manufacturer: null,
    country: null,
    properties: baseProperties,
    hopAlphaAcidPct: null,
    hopForm: null,
    fermentableExtractYieldPct: 80,
    fermentableColorEbc: 4,
    yeastAttenuationPct: null,
    yeastForm: null,
    yeastMinFermentationTempC: null,
    yeastMaxFermentationTempC: null,
    createdAt: now,
    updatedAt: now
  };

  return {
    ...baseRow,
    ...overrides,
    properties: {
      ...baseProperties,
      ...overrideProperties
    }
  };
};

vi.mock("../features/ingredients/service", () => ({
  loadIngredients: async () => mockState.catalogItems,
  getIngredientById: async (id: string) => mockState.catalogItems.find((item) => item.id === id) ?? null
}));

vi.mock("../features/ingredients/user-metadata-service", () => ({
  applyFavoriteStateToCatalogItems: async (_userId: string, items: any[]) => items.map((item) => ({
    ...item,
    isFavorite: mockState.favoriteKeys.has(`${item.source}:${item.id}`)
  })),
  listIngredientPurchaseLinksByReference: async () => []
}));

vi.mock("@nb/db", () => ({
  db: {
    query: {
      userCustomIngredients: {
        findMany: async () => mockState.customItems
      }
    },
    select: (_shape: Record<string, unknown>) => ({
      from: () => ({
        where: () => ({
          groupBy: async () => []
        }),
        innerJoin: () => ({
          where: () => ({
            groupBy: async () => []
          })
        })
      })
    })
  },
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  inArray: (...args: unknown[]) => args,
  isNull: (...args: unknown[]) => args,
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
  recipeIngredients: { ingredientCatalogItemId: "ingredientCatalogItemId", userCustomIngredientId: "userCustomIngredientId" },
  recipes: { id: "id", authorId: "authorId" },
  userCustomIngredients: { userId: "userId", id: "id" },
  userIngredients: { ingredientCatalogItemId: "ingredientCatalogItemId", userCustomIngredientId: "userCustomIngredientId", userId: "userId", archivedAt: "archivedAt" }
}));

import {
  getIngredientPickerQuickStartAvailability,
  getIngredientPickerQuickStartByContext,
  getIngredientPickerQuickStartAvailabilityBySubtype,
  listIngredientPickerQuickStart,
  searchUserCatalogIngredients
} from "../features/ingredients/catalog-service";

describe("user catalog ingredient search", () => {
  beforeEach(() => {
    mockState.catalogItems = [];
    mockState.customItems = [];
    mockState.favoriteKeys = new Set();
  });

  it("returns recent malt selections plus brand-first quick-start chips", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "favorite-pils",
        primaryLabelRu: "Пилснер",
        displayName: "Пилснер",
        nameRu: "Пилснер",
        nameEn: "Pilsner Malt"
      }),
      buildCatalogItem({
        id: "recent-vienna",
        primaryLabelRu: "Венский",
        displayName: "Венский",
        nameRu: "Венский",
        nameEn: "Vienna Malt",
        brand: "Weyermann",
        producer: "Weyermann",
        brandName: "Weyermann",
        manufacturer: "Weyermann"
      }),
      buildCatalogItem({
        id: "best-pale",
        primaryLabelRu: "Пэйл эль",
        displayName: "Пэйл эль",
        nameRu: "Пэйл эль",
        nameEn: "Pale Ale Malt",
        brand: "BESTMALZ",
        producer: "BESTMALZ",
        brandName: "BESTMALZ",
        manufacturer: "BESTMALZ"
      })
    ];
    mockState.favoriteKeys = new Set(["catalog:favorite-pils"]);

    const result = await listIngredientPickerQuickStart("user-1", {
      category: "fermentable",
      subtype: "malt",
      recentReferences: [
        { source: "catalog", id: "recent-vienna" },
        { source: "catalog", id: "favorite-pils" }
      ]
    });

    expect(result.recent.map((item) => item.id)).toEqual([
      "recent-vienna",
      "favorite-pils"
    ]);
    expect(result.brands.map((brand) => brand.label)).toEqual([
      "Castle Malting",
      "Weyermann",
      "Bestmalz"
    ]);
    expect(result.groups ?? []).toEqual([]);
  });

  it("returns fermentable quick-start chips grouped by canonical fermentable group", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "extract-1",
        subtype: "fermentable",
        groupName: "extracts_and_concentrates",
        brand: "Muntons",
        producer: "Muntons",
        brandName: "Muntons",
        manufacturer: "Muntons",
        technicalData: {
          type: "fermentable",
          displayTypeRu: "Сухой солодовый экстракт",
          subtypeKey: "malt_extract",
          productFamily: "extract_concentrate",
          extractForm: "dry"
        }
      }),
      buildCatalogItem({
        id: "sugar-1",
        subtype: "fermentable",
        groupName: "sugars_syrups_honey",
        brand: null,
        producer: null,
        brandName: null,
        manufacturer: null,
        technicalData: {
          type: "fermentable",
          displayTypeRu: "Сахар",
          subtypeKey: "sugar",
          productFamily: "sugar_syrup_honey"
        }
      }),
      buildCatalogItem({
        id: "sugar-2",
        subtype: "fermentable",
        groupName: "sugars_and_syrups",
        brand: null,
        producer: null,
        brandName: null,
        manufacturer: null,
        technicalData: {
          type: "fermentable",
          displayTypeRu: "Сироп",
          subtypeKey: "syrup",
          productFamily: "sugar_syrup_honey"
        }
      })
    ];

    const result = await listIngredientPickerQuickStart("user-1", {
      category: "fermentable",
      subtype: "fermentable",
      recentReferences: [
        { source: "catalog", id: "extract-1" }
      ]
    });

    expect(result.brands).toEqual([]);
    expect((result.groups ?? []).map((group) => group.value)).toEqual([
      "extracts_and_concentrates",
      "sugars_and_syrups"
    ]);
    expect((result.groups ?? []).map((group) => group.label)).toEqual([
      "Концентраты",
      "Сахара и сиропы"
    ]);
  });

  it("returns hop quick-start recent items and preloaded context data without brand chips", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "hop-favorite",
        type: "hop",
        category: "hop",
        subtype: "hop",
        primaryLabelRu: "Citra",
        displayName: "Citra",
        displayNameRu: "Citra",
        displayNameEn: "Citra",
        nameRu: "Citra",
        nameEn: "Citra",
        brand: "Yakima Chief",
        producer: "Yakima Chief",
        brandName: "Yakima Chief",
        manufacturer: "Yakima Chief",
        itemKind: "hop",
        technicalData: {
          type: "hop",
          alphaAcidPctTypical: 13,
          hopForm: "pellet"
        },
        defaultUnit: "g",
        defaultDisplayUnit: "g",
        allowedUnits: ["kg", "g"],
        measurementDimension: "mass"
      }),
      buildCatalogItem({
        id: "hop-recent",
        type: "hop",
        category: "hop",
        subtype: "hop",
        primaryLabelRu: "Mosaic",
        displayName: "Mosaic",
        displayNameRu: "Mosaic",
        displayNameEn: "Mosaic",
        nameRu: "Mosaic",
        nameEn: "Mosaic",
        brand: "Цук",
        producer: "Цук",
        brandName: "Цук",
        manufacturer: "Цук",
        itemKind: "hop",
        technicalData: {
          type: "hop",
          alphaAcidPctTypical: 12,
          hopForm: "pellet"
        },
        defaultUnit: "g",
        defaultDisplayUnit: "g",
        allowedUnits: ["kg", "g"],
        measurementDimension: "mass"
      })
    ];
    mockState.customItems = [
      buildCustomIngredientRow({
        id: "hop-custom",
        type: "hop",
        displayName: "My Hop",
        manufacturer: "Hop Heaven",
        hopAlphaAcidPct: 9,
        fermentableExtractYieldPct: null,
        fermentableColorEbc: null,
        properties: {
          category: "hop",
          subtype: "hop",
          nameEn: "My Hop",
          aliases: []
        }
      })
    ];
    mockState.favoriteKeys = new Set(["catalog:hop-favorite"]);

    const quickStart = await listIngredientPickerQuickStart("user-1", {
      category: "hop",
      recentReferences: [
        { source: "catalog", id: "hop-recent" }
      ]
    });

    expect(quickStart.recent.map((item) => item.id)).toEqual(["hop-recent"]);
    expect(quickStart.brands).toEqual([]);
    expect(quickStart.groups ?? []).toEqual([]);
    expect(quickStart.hasFavoritesAvailable).toBe(true);
    expect(quickStart.hasCustomAvailable).toBe(true);

    await expect(getIngredientPickerQuickStartByContext("user-1")).resolves.toMatchObject({
      hop: {
        hasFavoritesAvailable: true,
        hasCustomAvailable: true
      }
    });
  });

  it("returns yeast quick-start brands, recent items and preloaded context data", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "yeast-favorite",
        type: "yeast",
        category: "yeast",
        subtype: "yeast",
        primaryLabelRu: "US-05",
        displayName: "US-05",
        displayNameRu: "US-05",
        displayNameEn: "US-05",
        nameRu: "US-05",
        nameEn: "US-05",
        brand: "Fermentis",
        producer: "Fermentis",
        brandName: "Fermentis",
        manufacturer: "Fermentis",
        itemKind: "yeast",
        technicalData: {
          type: "yeast",
          form: "dry"
        },
        defaultUnit: "g",
        defaultDisplayUnit: "g",
        allowedUnits: ["g", "pcs"],
        measurementDimension: "count"
      }),
      buildCatalogItem({
        id: "yeast-recent",
        type: "yeast",
        category: "yeast",
        subtype: "yeast",
        primaryLabelRu: "Verdant IPA",
        displayName: "Verdant IPA",
        displayNameRu: "Verdant IPA",
        displayNameEn: "Verdant IPA",
        nameRu: "Verdant IPA",
        nameEn: "Verdant IPA",
        brand: "Lallemand",
        producer: "Lallemand",
        brandName: "Lallemand",
        manufacturer: "Lallemand",
        itemKind: "yeast",
        technicalData: {
          type: "yeast",
          form: "dry"
        },
        defaultUnit: "g",
        defaultDisplayUnit: "g",
        allowedUnits: ["g", "pcs"],
        measurementDimension: "count"
      })
    ];
    mockState.customItems = [
      buildCustomIngredientRow({
        id: "yeast-custom",
        type: "yeast",
        displayName: "My House Yeast",
        manufacturer: "Mangrove Jack's",
        yeastAttenuationPct: 78,
        fermentableExtractYieldPct: null,
        fermentableColorEbc: null,
        properties: {
          category: "yeast",
          subtype: "yeast",
          nameEn: "My House Yeast",
          aliases: []
        }
      })
    ];
    mockState.favoriteKeys = new Set(["catalog:yeast-favorite"]);

    const quickStart = await listIngredientPickerQuickStart("user-1", {
      category: "yeast",
      recentReferences: [
        { source: "catalog", id: "yeast-recent" }
      ]
    });

    expect(quickStart.recent.map((item) => item.id)).toEqual(["yeast-recent"]);
    expect(quickStart.brands.map((brand) => brand.label)).toEqual([
      "Lallemand",
      "Fermentis",
      "Mangrove Jack's"
    ]);
    expect(quickStart.groups ?? []).toEqual([]);
    expect(quickStart.hasFavoritesAvailable).toBe(true);
    expect(quickStart.hasCustomAvailable).toBe(true);

    await expect(getIngredientPickerQuickStartByContext("user-1")).resolves.toMatchObject({
      yeast: {
        hasFavoritesAvailable: true,
        hasCustomAvailable: true
      }
    });
  });

  it("returns water treatment quick-start groups, recent items and preloaded context data", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "wt-favorite",
        type: "water_treatment",
        category: "water_treatment",
        subtype: "salt",
        primaryLabelRu: "Хлорид кальция",
        displayName: "Хлорид кальция",
        nameRu: "Хлорид кальция",
        nameEn: "Calcium Chloride",
        brand: null,
        producer: null,
        brandName: null,
        manufacturer: null,
        itemKind: "salt",
        technicalData: {
          type: "water_treatment"
        },
        defaultUnit: "g",
        defaultDisplayUnit: "g",
        allowedUnits: ["g", "kg"],
        measurementDimension: "weight"
      }),
      buildCatalogItem({
        id: "wt-recent",
        type: "water_treatment",
        category: "water_treatment",
        subtype: "acid",
        primaryLabelRu: "Молочная кислота",
        displayName: "Молочная кислота",
        nameRu: "Молочная кислота",
        nameEn: "Lactic Acid",
        brand: null,
        producer: null,
        brandName: null,
        manufacturer: null,
        itemKind: "acid",
        technicalData: {
          type: "water_treatment"
        },
        defaultUnit: "ml",
        defaultDisplayUnit: "ml",
        allowedUnits: ["ml", "l"],
        measurementDimension: "volume"
      })
    ];
    mockState.customItems = [
      buildCustomIngredientRow({
        id: "wt-custom",
        type: "water_treatment",
        displayName: "Осмос",
        manufacturer: null,
        fermentableExtractYieldPct: null,
        fermentableColorEbc: null,
        properties: {
          category: "water_treatment",
          subtype: "water_source",
          nameEn: "RO Water",
          aliases: []
        }
      })
    ];
    mockState.favoriteKeys = new Set(["catalog:wt-favorite"]);

    const quickStart = await listIngredientPickerQuickStart("user-1", {
      category: "water_treatment",
      recentReferences: [
        { source: "catalog", id: "wt-recent" }
      ]
    });

    expect(quickStart.recent.map((item) => item.id)).toEqual(["wt-recent"]);
    expect((quickStart.groups ?? []).map((group) => group.value)).toEqual([
      "salt",
      "acid",
      "base",
      "dechlorination",
      "water_source"
    ]);
    expect(quickStart.brands).toEqual([]);
    expect(quickStart.hasFavoritesAvailable).toBe(true);
    expect(quickStart.hasCustomAvailable).toBe(true);

    await expect(getIngredientPickerQuickStartByContext("user-1")).resolves.toMatchObject({
      water_treatment: {
        hasFavoritesAvailable: true,
        hasCustomAvailable: true
      }
    });
  });

  it("returns consumable quick-start groups, recent items and preloaded context data", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "cons-favorite",
        type: "consumable",
        category: "consumable",
        subtype: null,
        primaryLabelRu: "Star San",
        displayName: "Star San",
        nameRu: "Star San",
        nameEn: "Star San",
        sourceCategory: "sanitizer",
        itemKind: "process_aid",
        technicalData: {
          type: "consumable",
          pickerGroup: "sanitizer"
        },
        defaultUnit: "ml",
        defaultDisplayUnit: "ml",
        allowedUnits: ["ml", "l"],
        measurementDimension: "volume"
      }),
      buildCatalogItem({
        id: "cons-recent",
        type: "consumable",
        category: "consumable",
        subtype: null,
        primaryLabelRu: "Кронен-пробки",
        displayName: "Кронен-пробки",
        nameRu: "Кронен-пробки",
        nameEn: "Crown Caps",
        sourceCategory: "packaging",
        itemKind: "other",
        technicalData: {
          type: "consumable",
          usageStage: ["packaging"]
        },
        defaultUnit: "item",
        defaultDisplayUnit: "item",
        allowedUnits: ["item", "pack"],
        measurementDimension: "count"
      })
    ];
    mockState.customItems = [
      buildCustomIngredientRow({
        id: "cons-custom",
        type: "consumable",
        displayName: "CO2",
        manufacturer: null,
        fermentableExtractYieldPct: null,
        fermentableColorEbc: null,
        properties: {
          category: "consumable",
          subtype: "other",
          sourceCategory: "gas",
          nameEn: "CO2",
          aliases: []
        }
      })
    ];
    mockState.favoriteKeys = new Set(["catalog:cons-favorite"]);

    const quickStart = await listIngredientPickerQuickStart("user-1", {
      category: "consumable",
      recentReferences: [
        { source: "catalog", id: "cons-recent" }
      ]
    });

    expect(quickStart.recent.map((item) => item.id)).toEqual(["cons-recent"]);
    expect((quickStart.groups ?? []).map((group) => group.value)).toEqual([
      "process_aid",
      "sanitizer",
      "cleaner",
      "fining",
      "enzyme",
      "nutrient",
      "antioxidant",
      "packaging",
      "gas"
    ]);
    expect(quickStart.brands).toEqual([]);
    expect(quickStart.hasFavoritesAvailable).toBe(true);
    expect(quickStart.hasCustomAvailable).toBe(true);

    await expect(getIngredientPickerQuickStartByContext("user-1")).resolves.toMatchObject({
      consumable: {
        hasFavoritesAvailable: true,
        hasCustomAvailable: true
      }
    });
  });

  it("returns precomputed quick-start availability for both fermentable subtypes", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "malt-favorite",
        subtype: "malt"
      })
    ];
    mockState.customItems = [
      buildCustomIngredientRow({
        id: "fermentable-custom",
        displayName: "Мой экстракт",
        properties: {
          category: "fermentable",
          subtype: "fermentable",
          nameEn: "My Extract",
          aliases: []
        }
      })
    ];
    mockState.favoriteKeys = new Set(["catalog:malt-favorite"]);

    await expect(getIngredientPickerQuickStartAvailability("user-1", {
      category: "fermentable",
      subtype: "malt"
    })).resolves.toEqual({
      hasFavoritesAvailable: true,
      hasCustomAvailable: false
    });

    await expect(getIngredientPickerQuickStartAvailability("user-1", {
      category: "fermentable",
      subtype: "fermentable"
    })).resolves.toEqual({
      hasFavoritesAvailable: false,
      hasCustomAvailable: true
    });

    await expect(getIngredientPickerQuickStartAvailabilityBySubtype("user-1")).resolves.toEqual({
      malt: {
        hasFavoritesAvailable: true,
        hasCustomAvailable: false
      },
      fermentable: {
        hasFavoritesAvailable: false,
        hasCustomAvailable: true
      }
    });
  });

  it("filters water treatment groups through sourceCategory and itemKind aliases, not only subtype", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "wt-acid-structured",
        type: "water_treatment",
        category: "water_treatment",
        subtype: "other",
        itemKind: "lactic_acid",
        sourceCategory: "кислоты",
        primaryLabelRu: "Молочная кислота 80%",
        displayName: "Молочная кислота 80%",
        nameRu: "Молочная кислота 80%",
        nameEn: "Lactic Acid 80%",
        technicalData: {
          type: "water_treatment",
          formula: "C3H6O3",
          recommendedFor: ["acidification"]
        },
        defaultUnit: "ml",
        defaultDisplayUnit: "ml",
        allowedUnits: ["ml", "l"],
        measurementDimension: "volume"
      }),
      buildCatalogItem({
        id: "wt-base-water",
        type: "water_treatment",
        category: "water_treatment",
        subtype: "water_source",
        primaryLabelRu: "Осмос",
        displayName: "Осмос",
        nameRu: "Осмос",
        nameEn: "RO Water",
        technicalData: {
          type: "water_treatment"
        },
        defaultUnit: "l",
        defaultDisplayUnit: "l",
        allowedUnits: ["l", "ml"],
        measurementDimension: "volume"
      })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "",
      category: "water_treatment",
      group: "acid",
      limit: 10
    });

    expect(result.items.map((item) => item.id)).toEqual(["wt-acid-structured"]);
    expect(result.appliedGroup?.value).toBe("acid");
  });

  it("filters consumable groups through subcategory and sourceCategory aliases", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "cons-sani-structured",
        type: "consumable",
        category: "consumable",
        subtype: "process_aid",
        itemKind: "process_aid",
        sourceCategory: "process_aid",
        subcategory: "Санитайзеры",
        primaryLabelRu: "Star San",
        displayName: "Star San",
        nameRu: "Star San",
        nameEn: "Star San",
        technicalData: {
          type: "consumable"
        },
        defaultUnit: "ml",
        defaultDisplayUnit: "ml",
        allowedUnits: ["ml", "l"],
        measurementDimension: "volume"
      }),
      buildCatalogItem({
        id: "cons-pack-structured",
        type: "consumable",
        category: "consumable",
        subtype: "other",
        itemKind: "closure",
        sourceCategory: "packaging",
        subcategory: "Тара и укупорка",
        primaryLabelRu: "Кронен-пробки",
        displayName: "Кронен-пробки",
        nameRu: "Кронен-пробки",
        nameEn: "Crown Caps",
        technicalData: {
          type: "consumable"
        },
        defaultUnit: "item",
        defaultDisplayUnit: "item",
        allowedUnits: ["item", "pack"],
        measurementDimension: "count"
      })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "",
      category: "consumable",
      group: "sanitizer",
      limit: 10
    });

    expect(result.items.map((item) => item.id)).toEqual(["cons-sani-structured"]);
    expect(result.appliedGroup?.value).toBe("sanitizer");
  });

  it("filters consumables by broad warehouse groups", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "cons-sani-broad",
        type: "consumable",
        category: "consumable",
        subtype: "sanitizer",
        itemKind: "sanitizer",
        sourceCategory: "sanitizer",
        primaryLabelRu: "Star San",
        displayName: "Star San",
        nameRu: "Star San",
        nameEn: "Star San",
        technicalData: {
          type: "consumable",
          pickerGroup: "sanitizer"
        },
        defaultUnit: "ml",
        defaultDisplayUnit: "ml",
        allowedUnits: ["ml", "l"],
        measurementDimension: "volume"
      }),
      buildCatalogItem({
        id: "cons-fining-broad",
        type: "consumable",
        category: "consumable",
        subtype: "fining",
        itemKind: "fining",
        sourceCategory: "fining",
        primaryLabelRu: "Irish Moss",
        displayName: "Irish Moss",
        nameRu: "Irish Moss",
        nameEn: "Irish Moss",
        technicalData: {
          type: "consumable",
          pickerGroup: "fining"
        },
        defaultUnit: "g",
        defaultDisplayUnit: "g",
        allowedUnits: ["g"],
        measurementDimension: "weight"
      })
    ];

    const supplies = await searchUserCatalogIngredients("user-1", {
      q: "",
      category: "consumable",
      group: "inventory_supplies",
      limit: 10
    });
    const additives = await searchUserCatalogIngredients("user-1", {
      q: "",
      category: "consumable",
      group: "inventory_additives",
      limit: 10
    });

    expect(supplies.items.map((item) => item.id)).toEqual(["cons-sani-broad"]);
    expect(supplies.appliedGroup).toMatchObject({
      label: "Расходники",
      value: "inventory_supplies"
    });
    expect(additives.items.map((item) => item.id)).toEqual(["cons-fining-broad"]);
    expect(additives.appliedGroup).toMatchObject({
      label: "Другие добавки",
      value: "inventory_additives"
    });
  });

  it("returns immediate malt family-scoped results even when the visible query is empty", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "castle-pilsner",
        primaryLabelRu: "Пилснер",
        displayName: "Пилснер",
        displayNameRu: "Пилснер",
        displayNameEn: "Pilsner Malt",
        nameRu: "Пилснер",
        nameEn: "Pilsner Malt",
        brand: "Castle Malting",
        producer: "Castle Malting",
        brandName: "Castle Malting",
        manufacturer: "Castle Malting"
      }),
      buildCatalogItem({
        id: "soufflet-pilsen",
        primaryLabelRu: "Pilsen 2RP",
        displayName: "Pilsen 2RP",
        displayNameRu: "Pilsen 2RP",
        displayNameEn: "Pilsen 2RP",
        nameRu: "Pilsen 2RP",
        nameEn: "Pilsen 2RP",
        brand: "Soufflet",
        producer: "Soufflet",
        brandName: "Soufflet",
        manufacturer: "Soufflet"
      }),
      buildCatalogItem({
        id: "castle-vienna",
        primaryLabelRu: "Венский",
        displayName: "Венский",
        displayNameRu: "Венский",
        displayNameEn: "Vienna Malt",
        nameRu: "Венский",
        nameEn: "Vienna Malt",
        brand: "Castle Malting",
        producer: "Castle Malting",
        brandName: "Castle Malting",
        manufacturer: "Castle Malting"
      })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "",
      family: "pilsner",
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    expect(result.appliedFamily).toMatchObject({
      key: "pilsner",
      label: "Пилснер"
    });
    expect(result.items.map((item) => item.id)).toEqual([
      "castle-pilsner",
      "soufflet-pilsen"
    ]);
    expect(result.items.some((item) => item.id === "castle-vienna")).toBe(false);
  });

  it("refines typed malt search inside the active family scope instead of replacing it with visible text", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "castle-pilsner",
        primaryLabelRu: "Castle Pilsner",
        displayName: "Castle Pilsner",
        displayNameRu: "Castle Pilsner",
        displayNameEn: "Castle Pilsner",
        nameRu: "Castle Pilsner",
        nameEn: "Castle Pilsner",
        brand: "Castle Malting",
        producer: "Castle Malting",
        brandName: "Castle Malting",
        manufacturer: "Castle Malting"
      }),
      buildCatalogItem({
        id: "castle-vienna",
        primaryLabelRu: "Castle Vienna",
        displayName: "Castle Vienna",
        displayNameRu: "Castle Vienna",
        displayNameEn: "Castle Vienna",
        nameRu: "Castle Vienna",
        nameEn: "Castle Vienna",
        brand: "Castle Malting",
        producer: "Castle Malting",
        brandName: "Castle Malting",
        manufacturer: "Castle Malting"
      }),
      buildCatalogItem({
        id: "weyermann-pilsner",
        primaryLabelRu: "Weyermann Pilsner",
        displayName: "Weyermann Pilsner",
        displayNameRu: "Weyermann Pilsner",
        displayNameEn: "Weyermann Pilsner",
        nameRu: "Weyermann Pilsner",
        nameEn: "Weyermann Pilsner",
        brand: "Weyermann",
        producer: "Weyermann",
        brandName: "Weyermann",
        manufacturer: "Weyermann"
      })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "castle",
      family: "pilsner",
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    expect(result.appliedFamily).toMatchObject({
      key: "pilsner",
      label: "Пилснер"
    });
    expect(result.items.map((item) => item.id)).toEqual(["castle-pilsner"]);
  });

  it("filters generic fermentables by normalized group and exposes the applied group label", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "extract-1",
        subtype: "fermentable",
        groupName: "extracts_and_concentrates",
        technicalData: {
          type: "fermentable",
          displayTypeRu: "Сухой солодовый экстракт",
          subtypeKey: "malt_extract",
          productFamily: "extract_concentrate",
          extractForm: "dry"
        }
      }),
      buildCatalogItem({
        id: "fruit-1",
        subtype: "fermentable",
        groupName: "fruits_and_vegetables",
        technicalData: {
          type: "fermentable",
          displayTypeRu: "Фруктовое пюре",
          subtypeKey: "fruit_puree",
          productFamily: "fruit_vegetable"
        }
      })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "",
      category: "fermentable",
      subtype: "fermentable",
      group: "extracts_and_concentrates",
      limit: 10
    });

    expect(result.items.map((item) => item.id)).toEqual(["extract-1"]);
    expect(result.appliedGroup).toMatchObject({
      value: "extracts_and_concentrates",
      label: "Концентраты"
    });
  });

  it("filters malt results to favorites only even without a typed query", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "favorite-pils",
        primaryLabelRu: "Пилснер",
        displayName: "Пилснер",
        nameRu: "Пилснер",
        nameEn: "Pilsner Malt"
      }),
      buildCatalogItem({
        id: "plain-vienna",
        primaryLabelRu: "Венский",
        displayName: "Венский",
        nameRu: "Венский",
        nameEn: "Vienna Malt"
      })
    ];
    mockState.favoriteKeys = new Set(["catalog:favorite-pils"]);

    const result = await searchUserCatalogIngredients("user-1", {
      q: "",
      favoritesOnly: true,
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    expect(result.appliedFavoritesOnly).toBe(true);
    expect(result.items.map((item) => item.id)).toEqual(["favorite-pils"]);
  });

  it("filters results to custom ingredients only even without a typed query", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "catalog-pils",
        displayName: "Pilsner",
        primaryLabelRu: "Pilsner",
        nameRu: "Pilsner",
        nameEn: "Pilsner"
      })
    ];
    mockState.customItems = [
      buildCustomIngredientRow({
        id: "custom-pils",
        displayName: "Мой пилс",
        properties: {
          category: "fermentable",
          subtype: "malt",
          nameEn: "My Pils",
          aliases: []
        }
      })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "",
      customOnly: true,
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    expect(result.appliedCustomOnly).toBe(true);
    expect(result.items.map((item) => item.id)).toEqual(["custom-pils"]);
  });

  it("stacks family and favorites scopes without dropping either filter", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "favorite-pils",
        primaryLabelRu: "Пилснер",
        displayName: "Пилснер",
        nameRu: "Пилснер",
        nameEn: "Pilsner Malt"
      }),
      buildCatalogItem({
        id: "plain-pils",
        primaryLabelRu: "Pilsen 2RP",
        displayName: "Pilsen 2RP",
        nameRu: "Pilsen 2RP",
        nameEn: "Pilsen 2RP"
      }),
      buildCatalogItem({
        id: "favorite-vienna",
        primaryLabelRu: "Венский",
        displayName: "Венский",
        nameRu: "Венский",
        nameEn: "Vienna Malt"
      })
    ];
    mockState.favoriteKeys = new Set([
      "catalog:favorite-pils",
      "catalog:favorite-vienna"
    ]);

    const result = await searchUserCatalogIngredients("user-1", {
      q: "",
      family: "pilsner",
      favoritesOnly: true,
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    expect(result.appliedFamily).toMatchObject({
      key: "pilsner"
    });
    expect(result.appliedFavoritesOnly).toBe(true);
    expect(result.items.map((item) => item.id)).toEqual(["favorite-pils"]);
  });

  it("stacks family, manufacturer and favorites scopes together", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "castle-favorite-pils",
        primaryLabelRu: "Castle Pilsner",
        displayName: "Castle Pilsner",
        nameRu: "Castle Pilsner",
        nameEn: "Castle Pilsner",
        brand: "Castle Malting",
        producer: "Castle Malting",
        brandName: "Castle Malting",
        manufacturer: "Castle Malting"
      }),
      buildCatalogItem({
        id: "castle-plain-pils",
        primaryLabelRu: "Castle Pilsen 2RP",
        displayName: "Castle Pilsen 2RP",
        nameRu: "Castle Pilsen 2RP",
        nameEn: "Castle Pilsen 2RP",
        brand: "Castle Malting",
        producer: "Castle Malting",
        brandName: "Castle Malting",
        manufacturer: "Castle Malting"
      }),
      buildCatalogItem({
        id: "weyermann-favorite-pils",
        primaryLabelRu: "Weyermann Pilsner",
        displayName: "Weyermann Pilsner",
        nameRu: "Weyermann Pilsner",
        nameEn: "Weyermann Pilsner",
        brand: "Weyermann",
        producer: "Weyermann",
        brandName: "Weyermann",
        manufacturer: "Weyermann"
      })
    ];
    mockState.favoriteKeys = new Set([
      "catalog:castle-favorite-pils",
      "catalog:weyermann-favorite-pils"
    ]);

    const result = await searchUserCatalogIngredients("user-1", {
      q: "",
      family: "pilsner",
      manufacturer: "Castle Malting",
      favoritesOnly: true,
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    expect(result.appliedFamily).toMatchObject({
      key: "pilsner"
    });
    expect(result.appliedManufacturer).toMatchObject({
      label: "Castle Malting"
    });
    expect(result.appliedFavoritesOnly).toBe(true);
    expect(result.items.map((item) => item.id)).toEqual(["castle-favorite-pils"]);
  });

  it("matches caramel quick-start preset queries through family-aware malt search", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "cara-120",
        primaryLabelRu: "Cara 120",
        displayName: "Cara 120",
        nameRu: "Cara 120",
        nameEn: "Crystal 120"
      }),
      buildCatalogItem({
        id: "pils-base",
        primaryLabelRu: "Pilsner Base",
        displayName: "Pilsner Base",
        nameRu: "Пилснер",
        nameEn: "Pilsner Base Malt"
      })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "caramel",
      category: "fermentable",
      subtype: "malt",
      limit: 5
    });

    expect(result.items[0]?.id).toBe("cara-120");
  });

  it("prefers consumable group refinements before manufacturer refinements for broad queries", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "sanitizer-acid-1",
        type: "consumable",
        category: "consumable",
        subtype: null,
        primaryLabelRu: "Кислотный санитайзер",
        displayName: "Кислотный санитайзер",
        nameRu: "Кислотный санитайзер",
        nameEn: "Acid Sanitizer",
        brand: "Five Star",
        producer: "Five Star",
        brandName: "Five Star",
        manufacturer: "Five Star",
        sourceCategory: "sanitizer",
        itemKind: "process_aid",
        technicalData: {
          type: "consumable",
          pickerGroup: "sanitizer",
          searchPriorityTermsEn: ["acid sanitizer"]
        },
        defaultUnit: "ml",
        defaultDisplayUnit: "ml",
        allowedUnits: ["ml", "l"],
        measurementDimension: "volume",
        completenessLevel: "recommended"
      }),
      buildCatalogItem({
        id: "cleaner-acid-1",
        type: "consumable",
        category: "consumable",
        subtype: null,
        primaryLabelRu: "Кислотная мойка",
        displayName: "Кислотная мойка",
        nameRu: "Кислотная мойка",
        nameEn: "Acid Beerstone Remover",
        brand: "Bir.RF",
        producer: "Bir.RF",
        brandName: "Bir.RF",
        manufacturer: "Bir.RF",
        sourceCategory: "cleaner",
        itemKind: "process_aid",
        technicalData: {
          type: "consumable",
          pickerGroup: "cleaner",
          searchPriorityTermsEn: ["acid cleaner", "acid beerstone remover"]
        },
        defaultUnit: "g",
        defaultDisplayUnit: "g",
        allowedUnits: ["g", "kg"],
        measurementDimension: "weight",
        completenessLevel: "recommended"
      }),
      buildCatalogItem({
        id: "cleaner-acid-2",
        type: "consumable",
        category: "consumable",
        subtype: null,
        primaryLabelRu: "Кислотный дескейлер",
        displayName: "Кислотный дескейлер",
        nameRu: "Кислотный дескейлер",
        nameEn: "Acid CIP Cleaner",
        brand: "KegLand",
        producer: "KegLand",
        brandName: "KegLand",
        manufacturer: "KegLand",
        sourceCategory: "cleaner",
        itemKind: "process_aid",
        technicalData: {
          type: "consumable",
          pickerGroup: "cleaner",
          searchPriorityTermsEn: ["acid cleaner", "acid cip cleaner"]
        },
        defaultUnit: "g",
        defaultDisplayUnit: "g",
        allowedUnits: ["g", "kg"],
        measurementDimension: "weight",
        completenessLevel: "recommended"
      })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "acid",
      category: "consumable",
      limit: 10
    });

    expect(result.refinements.slice(0, 2)).toMatchObject([
      { type: "consumable_group", label: "Санитайзеры", value: "sanitizer", count: 1 },
      { type: "consumable_group", label: "Мойка", value: "cleaner", count: 2 }
    ]);
    expect(result.appliedManufacturer).toBeNull();
    expect(result.appliedGroup).toBeNull();
  });

  it("returns manufacturer refinements for broad type-first queries", async () => {
    mockState.catalogItems = [
      buildCatalogItem({ id: "castle-pils-1", primaryLabelRu: "Castle Pilsner 2RS", displayName: "Castle Pilsner 2RS", nameRu: "Castle Pilsner 2RS", brand: "Castle Malting", producer: "Castle Malting", brandName: "Castle Malting", manufacturer: "Castle Malting" }),
      buildCatalogItem({ id: "castle-pils-2", primaryLabelRu: "Castle Pilsner 3RS", displayName: "Castle Pilsner 3RS", nameRu: "Castle Pilsner 3RS", brand: "Castle Malting", producer: "Castle Malting", brandName: "Castle Malting", manufacturer: "Castle Malting" }),
      buildCatalogItem({ id: "castle-pils-3", primaryLabelRu: "Castle Pils", displayName: "Castle Pils", nameRu: "Castle Pils", brand: "Castle Malting", producer: "Castle Malting", brandName: "Castle Malting", manufacturer: "Castle Malting" }),
      buildCatalogItem({ id: "castle-pils-4", primaryLabelRu: "Castle Pilsen", displayName: "Castle Pilsen", nameRu: "Castle Pilsen", brand: "Castle Malting", producer: "Castle Malting", brandName: "Castle Malting", manufacturer: "Castle Malting" }),
      buildCatalogItem({ id: "castle-pils-5", primaryLabelRu: "Castle Organic Pilsner", displayName: "Castle Organic Pilsner", nameRu: "Castle Organic Pilsner", brand: "Castle Malting", producer: "Castle Malting", brandName: "Castle Malting", manufacturer: "Castle Malting" }),
      buildCatalogItem({ id: "weyermann-pils-1", primaryLabelRu: "Weyermann Pilsner", displayName: "Weyermann Pilsner", nameRu: "Weyermann Pilsner", brand: "Weyermann", producer: "Weyermann", brandName: "Weyermann", manufacturer: "Weyermann", countryCode: "DE", countryName: "Germany", country: "Germany" }),
      buildCatalogItem({ id: "weyermann-pils-2", primaryLabelRu: "Weyermann Floor-Malted Pilsner", displayName: "Weyermann Floor-Malted Pilsner", nameRu: "Weyermann Floor-Malted Pilsner", brand: "Weyermann", producer: "Weyermann", brandName: "Weyermann", manufacturer: "Weyermann", countryCode: "DE", countryName: "Germany", country: "Germany" }),
      buildCatalogItem({ id: "weyermann-pils-3", primaryLabelRu: "Weyermann Bohemian Pilsner", displayName: "Weyermann Bohemian Pilsner", nameRu: "Weyermann Bohemian Pilsner", brand: "Weyermann", producer: "Weyermann", brandName: "Weyermann", manufacturer: "Weyermann", countryCode: "DE", countryName: "Germany", country: "Germany" }),
      buildCatalogItem({ id: "weyermann-pils-4", primaryLabelRu: "Weyermann Extra Pils", displayName: "Weyermann Extra Pils", nameRu: "Weyermann Extra Pils", brand: "Weyermann", producer: "Weyermann", brandName: "Weyermann", manufacturer: "Weyermann", countryCode: "DE", countryName: "Germany", country: "Germany" }),
      buildCatalogItem({ id: "soufflet-pils-1", primaryLabelRu: "Soufflet Pilsen 2RP", displayName: "Soufflet Pilsen 2RP", nameRu: "Soufflet Pilsen 2RP", brand: "Soufflet", producer: "Soufflet", brandName: "Soufflet", manufacturer: "Soufflet", countryCode: "FR", countryName: "France", country: "France" }),
      buildCatalogItem({ id: "soufflet-pils-2", primaryLabelRu: "Soufflet Premium Pils", displayName: "Soufflet Premium Pils", nameRu: "Soufflet Premium Pils", brand: "Soufflet", producer: "Soufflet", brandName: "Soufflet", manufacturer: "Soufflet", countryCode: "FR", countryName: "France", country: "France" })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "pils",
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    expect(result.total).toBe(11);
    expect(result.items).toHaveLength(10);
    expect(result.isBroadMatch).toBe(true);
    expect(result.hasMore).toBe(true);
    expect(result.refinements.slice(0, 3)).toMatchObject([
      { label: "Castle Malting", count: 5 },
      { label: "Weyermann", count: 4 },
      { label: "Soufflet", count: 2 }
    ]);
  });

  it("surfaces a manufacturer refinement for broad brand-first queries", async () => {
    mockState.catalogItems = Array.from({ length: 11 }, (_, index) => buildCatalogItem({
      id: `castle-item-${index + 1}`,
      primaryLabelRu: `Castle Malt ${index + 1}`,
      displayName: `Castle Malt ${index + 1}`,
      nameRu: `Castle Malt ${index + 1}`,
      brand: "Castle Malting",
      producer: "Castle Malting",
      brandName: "Castle Malting",
      manufacturer: "Castle Malting"
    }));

    const result = await searchUserCatalogIngredients("user-1", {
      q: "cas",
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    expect(result.total).toBe(11);
    expect(result.isBroadMatch).toBe(true);
    expect(result.refinements[0]).toMatchObject({
      label: "Castle Malting",
      count: 11
    });
  });

  it("scopes results to the selected manufacturer without dropping the query", async () => {
    mockState.catalogItems = [
      buildCatalogItem({ id: "castle-pilsner-2rs", primaryLabelRu: "Pilsner 2RS", displayName: "Pilsner 2RS", nameRu: "Pilsner 2RS", brand: "Castle Malting", producer: "Castle Malting", brandName: "Castle Malting", manufacturer: "Castle Malting" }),
      buildCatalogItem({ id: "castle-pilsner-3rs", primaryLabelRu: "Pilsner 3RS", displayName: "Pilsner 3RS", nameRu: "Pilsner 3RS", brand: "Castle Malting", producer: "Castle Malting", brandName: "Castle Malting", manufacturer: "Castle Malting" }),
      buildCatalogItem({
        id: "castle-vienna",
        primaryLabelRu: "Vienna",
        secondaryLabelRu: "Vienna Malt",
        displayName: "Vienna",
        displayNameRu: "Vienna",
        displayNameEn: "Vienna Malt",
        nameRu: "Vienna",
        nameEn: "Vienna Malt",
        brand: "Castle Malting",
        producer: "Castle Malting",
        brandName: "Castle Malting",
        manufacturer: "Castle Malting"
      }),
      buildCatalogItem({ id: "weyermann-pilsner", primaryLabelRu: "Pilsner", displayName: "Pilsner", nameRu: "Pilsner", brand: "Weyermann", producer: "Weyermann", brandName: "Weyermann", manufacturer: "Weyermann", countryCode: "DE", countryName: "Germany", country: "Germany" })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "pils",
      category: "fermentable",
      subtype: "malt",
      manufacturer: "Castle Malting",
      limit: 10
    });

    expect(result.total).toBe(2);
    expect(result.isBroadMatch).toBe(false);
    expect(result.refinements).toEqual([]);
    expect(result.appliedManufacturer).toMatchObject({
      label: "Castle Malting",
      normalizedLabel: "castle malting"
    });
    expect(result.items.map((item) => item.id)).toEqual([
      "castle-pilsner-2rs",
      "castle-pilsner-3rs"
    ]);
    expect(result.items.every((item) => item.brand === "Castle Malting")).toBe(true);
  });

  it("uses manufacturer refinements as a secondary layer inside a selected consumable group", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "cleaner-pbw-1",
        type: "consumable",
        category: "consumable",
        subtype: null,
        primaryLabelRu: "Щелочная мойка PBW",
        displayName: "Щелочная мойка PBW",
        nameRu: "Щелочная мойка PBW",
        nameEn: "PBW Cleaner",
        brand: "Five Star",
        producer: "Five Star",
        brandName: "Five Star",
        manufacturer: "Five Star",
        sourceCategory: "cleaner",
        itemKind: "process_aid",
        technicalData: {
          type: "consumable",
          pickerGroup: "cleaner",
          searchPriorityTermsEn: ["pbw", "alkaline cleaner"]
        },
        defaultUnit: "g",
        defaultDisplayUnit: "g",
        allowedUnits: ["g", "kg"],
        measurementDimension: "weight",
        completenessLevel: "recommended"
      }),
      buildCatalogItem({
        id: "cleaner-pbw-2",
        type: "consumable",
        category: "consumable",
        subtype: null,
        primaryLabelRu: "Щелочная мойка",
        displayName: "Щелочная мойка",
        nameRu: "Щелочная мойка",
        nameEn: "Alkaline Cleaner",
        brand: "KegLand",
        producer: "KegLand",
        brandName: "KegLand",
        manufacturer: "KegLand",
        sourceCategory: "cleaner",
        itemKind: "process_aid",
        technicalData: {
          type: "consumable",
          pickerGroup: "cleaner",
          searchPriorityTermsEn: ["pbw", "alkaline cleaner"]
        },
        defaultUnit: "g",
        defaultDisplayUnit: "g",
        allowedUnits: ["g", "kg"],
        measurementDimension: "weight",
        completenessLevel: "recommended"
      })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "pbw",
      category: "consumable",
      group: "cleaner",
      limit: 10
    });

    expect(result.appliedGroup).toMatchObject({
      label: "Мойка",
      value: "cleaner"
    });
    expect(result.refinements).toMatchObject([
      { type: "manufacturer", label: "Five Star", value: "Five Star", count: 1 },
      { type: "manufacturer", label: "KegLand", value: "KegLand", count: 1 }
    ]);
  });

  it("makes favorites visibly stronger inside a broad family-equivalent bucket", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "pilsner-exact",
        primaryLabelRu: "Pilsner",
        displayName: "Pilsner",
        nameRu: "Pilsner",
        brand: "Castle Malting",
        producer: "Castle Malting",
        brandName: "Castle Malting",
        manufacturer: "Castle Malting"
      }),
      buildCatalogItem({
        id: "pilsner-favorite",
        primaryLabelRu: "Pilsen 2RS",
        displayName: "Pilsen 2RS",
        displayNameRu: "Pilsen 2RS",
        displayNameEn: "Pilsen 2RS",
        nameRu: "Pilsen 2RS",
        nameEn: "Pilsen 2RS",
        brand: "Weyermann",
        producer: "Weyermann",
        brandName: "Weyermann",
        manufacturer: "Weyermann",
        aliases: [{
          id: "alias-pilsner-favorite",
          locale: "en",
          alias: "Pilsner",
          aliasNormalized: "pilsner",
          source: "seed",
          isEnabled: true
        }]
      })
    ];
    mockState.favoriteKeys = new Set(["catalog:pilsner-favorite"]);

    const result = await searchUserCatalogIngredients("user-1", {
      q: "pilsner",
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      id: "pilsner-favorite",
      isFavorite: true
    });
    expect(result.items[1]).toMatchObject({
      id: "pilsner-exact",
      isFavorite: false
    });
  });

  it("keeps strong family-equivalent results grouped near the top for пилснер", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "ru-pilsner",
        primaryLabelRu: "Пилснер",
        displayName: "Пилснер",
        displayNameRu: "Пилснер",
        displayNameEn: "Pilsner",
        nameRu: "Пилснер",
        nameEn: "Pilsner",
        brand: "Курский солод",
        producer: "Курский солод",
        brandName: "Курский солод",
        manufacturer: "Курский солод",
        country: "Россия",
        countryCode: "RU",
        countryName: "Россия"
      }),
      buildCatalogItem({
        id: "ru-pilsner-premium",
        primaryLabelRu: "Пилснер Премиум",
        displayName: "Пилснер Премиум",
        displayNameRu: "Пилснер Премиум",
        displayNameEn: "Pilsner Premium",
        nameRu: "Пилснер Премиум",
        nameEn: "Pilsner Premium"
      }),
      buildCatalogItem({
        id: "alias-pilsen",
        primaryLabelRu: "Pilsen 2RP",
        displayName: "Pilsen 2RP",
        displayNameRu: "Pilsen 2RP",
        displayNameEn: "Pilsen 2RP",
        nameRu: "Pilsen 2RP",
        nameEn: "Pilsen 2RP",
        aliases: [{
          id: "alias-pilsner-ru",
          locale: "ru",
          alias: "пилснер",
          aliasNormalized: "пилснер",
          source: "seed",
          isEnabled: true
        }]
      })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "пилснер",
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    const topIds = result.items.slice(0, 3).map((item) => item.id);

    expect(topIds[0]).toBe("ru-pilsner");
    expect(topIds).toContain("ru-pilsner-premium");
    expect(topIds).toContain("alias-pilsen");
  });

  it("keeps strong family equivalents across RU/EN near the top for pilsner", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "en-pilsner",
        primaryLabelRu: "Pilsner",
        displayName: "Pilsner",
        displayNameRu: "Pilsner",
        displayNameEn: "Pilsner",
        nameRu: "Pilsner",
        nameEn: "Pilsner"
      }),
      buildCatalogItem({
        id: "en-pilsner-premium",
        primaryLabelRu: "Pilsner Premium",
        displayName: "Pilsner Premium",
        displayNameRu: "Pilsner Premium",
        displayNameEn: "Pilsner Premium",
        nameRu: "Pilsner Premium",
        nameEn: "Pilsner Premium"
      }),
      buildCatalogItem({
        id: "ru-alias-only",
        primaryLabelRu: "Пильзен 2RP",
        displayName: "Пильзен 2RP",
        displayNameRu: "Пильзен 2RP",
        displayNameEn: null,
        nameRu: "Пильзен 2RP",
        nameEn: null,
        aliases: [{
          id: "alias-pilsner-en",
          locale: "ru",
          alias: "пилснер",
          aliasNormalized: "пилснер",
          source: "seed",
          isEnabled: true
        }]
      })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "pilsner",
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    const topIds = result.items.slice(0, 3).map((item) => item.id);

    expect(topIds[0]).toBe("en-pilsner");
    expect(topIds).toContain("en-pilsner-premium");
    expect(topIds).toContain("ru-alias-only");
  });

  it("supports generic family recall for пилс without burying modified family variants", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "ru-pils",
        primaryLabelRu: "Пилснер",
        displayName: "Пилснер",
        displayNameRu: "Пилснер",
        displayNameEn: "Pilsner",
        nameRu: "Пилснер",
        nameEn: "Pilsner"
      }),
      buildCatalogItem({
        id: "ru-pils-extra",
        primaryLabelRu: "Пилснер Экстра",
        displayName: "Пилснер Экстра",
        displayNameRu: "Пилснер Экстра",
        displayNameEn: "Pilsner Extra",
        nameRu: "Пилснер Экстра",
        nameEn: "Pilsner Extra"
      }),
      buildCatalogItem({
        id: "ru-pils-alias",
        primaryLabelRu: "Pilsen 2RP",
        displayName: "Pilsen 2RP",
        displayNameRu: "Pilsen 2RP",
        displayNameEn: "Pilsen 2RP",
        nameRu: "Pilsen 2RP",
        nameEn: "Pilsen 2RP",
        aliases: [{
          id: "alias-pils-short-ru",
          locale: "ru",
          alias: "пилс",
          aliasNormalized: "пилс",
          source: "seed",
          isEnabled: true
        }]
      })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "пилс",
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    const topIds = result.items.slice(0, 3).map((item) => item.id);

    expect(topIds[0]).toBe("ru-pils");
    expect(topIds).toContain("ru-pils-extra");
    expect(topIds).toContain("ru-pils-alias");
  });

  it("supports generic family recall for pils without dropping cross-form family candidates", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "en-pils",
        primaryLabelRu: "Pilsner",
        displayName: "Pilsner",
        displayNameRu: "Pilsner",
        displayNameEn: "Pilsner",
        nameRu: "Pilsner",
        nameEn: "Pilsner"
      }),
      buildCatalogItem({
        id: "en-pils-extra",
        primaryLabelRu: "Pilsner Extra",
        displayName: "Pilsner Extra",
        displayNameRu: "Pilsner Extra",
        displayNameEn: "Pilsner Extra",
        nameRu: "Pilsner Extra",
        nameEn: "Pilsner Extra"
      }),
      buildCatalogItem({
        id: "en-pils-alias",
        primaryLabelRu: "Пильзен 2RP",
        displayName: "Пильзен 2RP",
        displayNameRu: "Пильзен 2RP",
        displayNameEn: null,
        nameRu: "Пильзен 2RP",
        nameEn: null,
        aliases: [{
          id: "alias-pils-short-en",
          locale: "en",
          alias: "pils",
          aliasNormalized: "pils",
          source: "seed",
          isEnabled: true
        }]
      })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "pils",
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    const topIds = result.items.slice(0, 3).map((item) => item.id);

    expect(topIds[0]).toBe("en-pils");
    expect(topIds).toContain("en-pils-extra");
    expect(topIds).toContain("en-pils-alias");
  });

  it("does not let favorite support-alias helpers outrank strong family-equivalent hits", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "ru-direct",
        primaryLabelRu: "Пилснер",
        displayName: "Пилснер",
        displayNameRu: "Пилснер",
        displayNameEn: "Pilsner",
        nameRu: "Пилснер",
        nameEn: "Pilsner"
      }),
      buildCatalogItem({
        id: "favorite-helper-alias",
        primaryLabelRu: "Base Malt",
        displayName: "Base Malt",
        displayNameRu: "Base Malt",
        displayNameEn: "Base Malt",
        nameRu: "Base Malt",
        nameEn: "Base Malt",
        aliases: [{
          id: "alias-favorite-helper-ru",
          locale: "ru",
          alias: "пилснер база",
          aliasNormalized: "пилснер база",
          source: "seed",
          isEnabled: true
        }]
      })
    ];
    mockState.favoriteKeys = new Set(["catalog:favorite-helper-alias"]);

    const result = await searchUserCatalogIngredients("user-1", {
      q: "пилснер",
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    expect(result.items.map((item) => item.id)).toEqual([
      "ru-direct",
      "favorite-helper-alias"
    ]);
    expect(result.items[1]?.isFavorite).toBe(true);
  });

  it("uses lightweight popularity signals to keep more expected family brands above obscure ones", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "castle-pilsner",
        primaryLabelRu: "Castle Pilsner",
        displayName: "Castle Pilsner",
        displayNameRu: "Castle Pilsner",
        displayNameEn: "Castle Pilsner",
        nameRu: "Castle Pilsner",
        nameEn: "Castle Pilsner",
        brand: "Castle Malting",
        producer: "Castle Malting",
        brandName: "Castle Malting",
        manufacturer: "Castle Malting",
        sources: [{
          id: "source-castle-pilsner",
          ingredientId: "castle-pilsner",
          kind: "catalog",
          label: "Birrf",
          url: null,
          sourceBasis: "seed",
          position: 0
        }]
      }),
      buildCatalogItem({
        id: "castle-pilsner-extra",
        primaryLabelRu: "Castle Pilsner Extra",
        displayName: "Castle Pilsner Extra",
        displayNameRu: "Castle Pilsner Extra",
        displayNameEn: "Castle Pilsner Extra",
        nameRu: "Castle Pilsner Extra",
        nameEn: "Castle Pilsner Extra",
        brand: "Castle Malting",
        producer: "Castle Malting",
        brandName: "Castle Malting",
        manufacturer: "Castle Malting"
      }),
      buildCatalogItem({
        id: "obscure-pilsner",
        primaryLabelRu: "Obscure Pilsner",
        displayName: "Obscure Pilsner",
        displayNameRu: "Obscure Pilsner",
        displayNameEn: "Obscure Pilsner",
        nameRu: "Obscure Pilsner",
        nameEn: "Obscure Pilsner",
        brand: "Small Mill",
        producer: "Small Mill",
        brandName: "Small Mill",
        manufacturer: "Small Mill"
      })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "pilsner",
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    const ids = result.items.map((item) => item.id);

    expect(ids[0]).toBe("castle-pilsner");
    expect(ids.indexOf("castle-pilsner")).toBeLessThan(ids.indexOf("obscure-pilsner"));
  });

  it("prioritizes modifier-aware family results for пилснер премиум", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "plain-pilsner",
        primaryLabelRu: "Пилснер",
        displayName: "Пилснер",
        displayNameRu: "Пилснер",
        displayNameEn: "Pilsner",
        nameRu: "Пилснер",
        nameEn: "Pilsner"
      }),
      buildCatalogItem({
        id: "premium-pilsner",
        primaryLabelRu: "Пилснер Премиум",
        displayName: "Пилснер Премиум",
        displayNameRu: "Пилснер Премиум",
        displayNameEn: "Pilsner Premium",
        nameRu: "Пилснер Премиум",
        nameEn: "Pilsner Premium"
      }),
      buildCatalogItem({
        id: "pilsen-2rp",
        primaryLabelRu: "Pilsen 2RP",
        displayName: "Pilsen 2RP",
        displayNameRu: "Pilsen 2RP",
        displayNameEn: "Pilsen 2RP",
        nameRu: "Pilsen 2RP",
        nameEn: "Pilsen 2RP"
      })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "пилснер премиум",
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    expect(result.items[0]?.id).toBe("premium-pilsner");
  });

  it("prioritizes brand plus family intent for castle pilsner", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "castle-pilsner-brand",
        primaryLabelRu: "Castle Pilsner",
        displayName: "Castle Pilsner",
        displayNameRu: "Castle Pilsner",
        displayNameEn: "Castle Pilsner",
        nameRu: "Castle Pilsner",
        nameEn: "Castle Pilsner",
        brand: "Castle Malting",
        producer: "Castle Malting",
        brandName: "Castle Malting",
        manufacturer: "Castle Malting"
      }),
      buildCatalogItem({
        id: "castle-vienna-brand",
        primaryLabelRu: "Castle Vienna",
        displayName: "Castle Vienna",
        displayNameRu: "Castle Vienna",
        displayNameEn: "Castle Vienna",
        nameRu: "Castle Vienna",
        nameEn: "Castle Vienna",
        brand: "Castle Malting",
        producer: "Castle Malting",
        brandName: "Castle Malting",
        manufacturer: "Castle Malting"
      }),
      buildCatalogItem({
        id: "weyermann-pilsner-brand",
        primaryLabelRu: "Weyermann Pilsner",
        displayName: "Weyermann Pilsner",
        displayNameRu: "Weyermann Pilsner",
        displayNameEn: "Weyermann Pilsner",
        nameRu: "Weyermann Pilsner",
        nameEn: "Weyermann Pilsner",
        brand: "Weyermann",
        producer: "Weyermann",
        brandName: "Weyermann",
        manufacturer: "Weyermann"
      })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "castle pilsner",
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    expect(result.items[0]?.id).toBe("castle-pilsner-brand");
    expect(result.items[1]?.id).not.toBe("castle-vienna-brand");
  });

  it("prioritizes code-specific intent for 2rp", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "pilsen-2rp-code",
        primaryLabelRu: "Pilsen 2RP",
        displayName: "Pilsen 2RP",
        displayNameRu: "Pilsen 2RP",
        displayNameEn: "Pilsen 2RP",
        nameRu: "Pilsen 2RP",
        nameEn: "Pilsen 2RP"
      }),
      buildCatalogItem({
        id: "pilsen-2rs-code",
        primaryLabelRu: "Pilsen 2RS",
        displayName: "Pilsen 2RS",
        displayNameRu: "Pilsen 2RS",
        displayNameEn: "Pilsen 2RS",
        nameRu: "Pilsen 2RS",
        nameEn: "Pilsen 2RS"
      }),
      buildCatalogItem({
        id: "plain-pilsner-code",
        primaryLabelRu: "Pilsner",
        displayName: "Pilsner",
        displayNameRu: "Pilsner",
        displayNameEn: "Pilsner",
        nameRu: "Pilsner",
        nameEn: "Pilsner"
      })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "2rp",
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    expect(result.items[0]?.id).toBe("pilsen-2rp-code");
  });

  it("uses custom as a tie-breaker within the same semantic tier", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "catalog-pilsner-premium",
        primaryLabelRu: "Pilsner Premium",
        displayName: "Pilsner Premium",
        displayNameRu: "Pilsner Premium",
        displayNameEn: "Pilsner Premium",
        nameRu: "Pilsner Premium",
        nameEn: "Pilsner Premium"
      })
    ];
    mockState.customItems = [
      buildCustomIngredientRow({
        id: "custom-pilsner-premium",
        displayName: "Pilsner Premium",
        properties: {
          category: "fermentable",
          subtype: "malt",
          nameEn: "Pilsner Premium"
        }
      })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "pilsner premium",
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    expect(result.items.map((item) => item.id)).toEqual([
      "custom-pilsner-premium",
      "catalog-pilsner-premium"
    ]);
  });

  it("does not let custom alias-only matches outrank stronger catalog direct-name hits", async () => {
    mockState.catalogItems = [
      buildCatalogItem({
        id: "catalog-direct-pilsner",
        primaryLabelRu: "Pilsner",
        displayName: "Pilsner",
        displayNameRu: "Pilsner",
        displayNameEn: "Pilsner",
        nameRu: "Pilsner",
        nameEn: "Pilsner"
      })
    ];
    mockState.customItems = [
      buildCustomIngredientRow({
        id: "custom-alias-pilsner",
        displayName: "Pilsen 2RP",
        properties: {
          category: "fermentable",
          subtype: "malt",
          nameEn: "Pilsen 2RP",
          aliases: [{
            locale: "en",
            alias: "Pilsner",
            isEnabled: true
          }]
        }
      })
    ];

    const result = await searchUserCatalogIngredients("user-1", {
      q: "pilsner",
      category: "fermentable",
      subtype: "malt",
      limit: 10
    });

    expect(result.items.map((item) => item.id)).toEqual([
      "catalog-direct-pilsner",
      "custom-alias-pilsner"
    ]);
  });
});
