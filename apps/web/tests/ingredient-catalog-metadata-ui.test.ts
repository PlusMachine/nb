import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  listResult: null as any,
  detailItem: null as any
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => React.createElement("a", {
    href: typeof href === "string" ? href : String(href),
    ...props
  }, children)
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  }
}));

vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ id: "user-1" })
}));

vi.mock("@/features/ingredients/catalog-service", () => ({
  listUserCatalogIngredients: async () => mockState.listResult,
  getUserCatalogIngredientByRef: async () => mockState.detailItem
}));

vi.mock("@/components/ingredients/ingredient-favorite-toggle", () => ({
  IngredientFavoriteToggle: ({ label, initialFavorite }: any) => React.createElement("button", {
    type: "button",
    "data-favorite": initialFavorite ? "1" : "0"
  }, label)
}));

vi.mock("@/components/ingredients/ingredient-purchase-links-manager", () => ({
  IngredientPurchaseLinksEditor: ({ initialLinks }: any) => React.createElement("div", null, `purchase-links:${initialLinks?.length ?? 0}`)
}));

vi.mock("@/components/ingredients/delete-custom-catalog-ingredient-button", () => ({
  DeleteCustomCatalogIngredientButton: ({ label }: any) => React.createElement("button", { type: "button" }, label ?? "Удалить")
}));

vi.mock("@/components/ingredients/ingredient-catalog-toolbar", () => ({
  IngredientCatalogToolbar: () => React.createElement("div", null, "toolbar")
}));

vi.mock("@/components/shared/country-flag", () => ({
  CountryFlagLabel: ({ label }: any) => React.createElement("span", null, label)
}));

import { IngredientCatalogContent } from "../app/(app)/app/catalog/content";
import IngredientDetailPage from "../app/(app)/app/catalog/[source]/[id]/page";

const buildCatalogItem = (overrides: Record<string, unknown> = {}) => ({
  id: "catalog-hop-1",
  source: "catalog",
  type: "hop",
  category: "hop",
  subtype: null,
  familyId: null,
  primaryLabelRu: "Citra",
  secondaryLabelRu: "Цитра",
  displayName: "Citra",
  displayNameRu: "Citra",
  displayNameEn: "Citra",
  nameRu: "Citra",
  nameEn: "Citra",
  displayModeRu: "localized_first",
  displayNameOverrideRu: null,
  secondaryNameOverrideRu: null,
  hideSecondaryNameRu: false,
  brand: "Yakima Chief",
  producer: "Yakima Chief",
  brandName: "Yakima Chief",
  manufacturer: "Yakima Chief",
  country: "США",
  countryCode: "US",
  countryName: "США",
  productCode: null,
  aliases: [],
  sources: [],
  packageVariants: [],
  notes: null,
  properties: null,
  technicalData: {
    type: "hop",
    alphaAcidPctTypical: 12.5,
    betaAcidPctTypical: 4.2,
    hopForm: "pellet"
  },
  defaultUnit: "g",
  defaultDisplayUnit: "g",
  allowedUnits: ["g"],
  measurementDimension: "weight",
  completenessLevel: "recommended",
  quantityDefaults: null,
  unitPreferred: null,
  derivedFromIngredientId: null,
  derivedFromDisplayName: null,
  inventoryUsageCount: 1,
  recipeUsageCount: 2,
  inventoryInUse: true,
  recipeInUse: true,
  isFavorite: false,
  hopAlphaAcidPct: 12.5,
  hopBetaAcidPct: 4.2,
  hopForm: "pellet",
  fermentableColorLovibond: null,
  fermentableExtractYieldPct: null,
  yeastAttenuationPct: null,
  yeastMinFermentationTempC: null,
  yeastMaxFermentationTempC: null,
  purchaseLinks: [],
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-01T00:00:00.000Z"),
  ...overrides
});

describe("ingredient catalog metadata ui", () => {
  beforeEach(() => {
    mockState.listResult = {
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      facets: {
        catalogCount: 0,
        customCount: 0,
        byCategory: {
          fermentable: 0,
          hop: 0,
          yeast: 0,
          consumable: 0,
          water_treatment: 0
        },
        byFermentableSubtype: {
          malt: 0,
          fermentable: 0
        }
      }
    };
    mockState.detailItem = null;
  });

  it("renders favorite toggles in the catalog list without introducing a text badge", async () => {
    mockState.listResult = {
      ...mockState.listResult,
      items: [
        buildCatalogItem({
          isFavorite: true
        })
      ],
      total: 1,
      facets: {
        ...mockState.listResult.facets,
        catalogCount: 1
      }
    };

    const html = renderToStaticMarkup(await IngredientCatalogContent({
      searchParams: Promise.resolve({})
    }));

    expect(html).toContain("Убрать из избранного");
    expect(html).not.toContain(">ИЗБРАННОЕ<");
  });

  it("renders favorite toggle and purchase-links section on the ingredient detail page", async () => {
    mockState.detailItem = buildCatalogItem({
      isFavorite: false,
      purchaseLinks: [
        {
          id: "link-1",
          url: "https://ozon.ru/product/citra",
          normalizedUrl: "https://ozon.ru/product/citra",
          host: "ozon.ru",
          displayHost: "ozon.ru",
          marketplace: "ozon",
          marketplaceLabel: "Ozon",
          position: 0
        }
      ]
    });

    const html = renderToStaticMarkup(await IngredientDetailPage({
      params: Promise.resolve({
        source: "system",
        id: "catalog-hop-1"
      })
    }));

    expect(html).toContain("Добавить в избранное");
    expect(html).toContain("Где купить");
    expect(html).toContain("purchase-links:1");
  });

  it("shows producer as the brand label for fermentables on the detail page", async () => {
    mockState.detailItem = buildCatalogItem({
      id: "catalog-fermentable-1",
      type: "fermentable",
      category: "fermentable",
      subtype: "fermentable",
      primaryLabelRu: "Баварский пилснер",
      secondaryLabelRu: "Bavarian Pilsner",
      displayName: "Баварский пилснер",
      displayNameRu: "Баварский пилснер",
      displayNameEn: "Bavarian Pilsner",
      nameRu: "Баварский пилснер",
      nameEn: "Bavarian Pilsner",
      brand: null,
      producer: "Weyermann",
      brandName: null,
      manufacturer: "Weyermann",
      technicalData: {
        type: "fermentable",
        extractPctDryBasis: 75,
        colorLovibond: 6.1
      },
      fermentableColorLovibond: 6.1,
      fermentableExtractYieldPct: 75
    });

    const html = renderToStaticMarkup(await IngredientDetailPage({
      params: Promise.resolve({
        source: "system",
        id: "catalog-fermentable-1"
      })
    }));

    expect(html).toContain("Weyermann");
    expect(html).toContain("Бренд");
  });
});
