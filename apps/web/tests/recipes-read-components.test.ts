import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import RecipesError from "../app/(app)/app/recipes/error";
import RecipeDetailError from "../app/(app)/app/recipes/[id]/error";
import PublicRecipeError from "../app/(public)/recipes/[slug]/error";
import PublicRecipeNotFound from "../app/(public)/recipes/[slug]/not-found";
import PublicRecipesError from "../app/(public)/recipes/error";
import { RecipeEmptyState } from "../components/recipes/recipe-empty-state";
import { buildRecipeIngredientTechnicalBadges } from "../components/recipes/recipe-ingredient-card-display";
import { PublicRecipePage } from "../components/recipes/public-recipe-page";
import { RecipeIngredientsSection } from "../components/recipes/recipe-ingredients-section";
import { RecipeMetaSection } from "../components/recipes/recipe-meta-section";
import { RecipeStatsSummary } from "../components/recipes/recipe-stats-summary";
import { defaultRecipeProcessMeta, type RecipeDetailDto } from "../features/recipes/contracts";

const recipeDetail: RecipeDetailDto = {
  id: "r-1",
  authorId: "u-1",
  recipeFamilyId: "rf-1",
  versionNumber: 1,
  versionCount: 1,
  publicationState: "published",
  title: "Hazy IPA",
  slug: "public-ipa",
  styleId: null,
  batchSizeEnteredQuantity: 20,
  batchSizeEnteredUnit: "l",
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  efficiency: 75,
  boilTimeMinutes: 60,
  og: 1.061,
  fg: 1.012,
  abv: 6.4,
  ibu: 42,
  color: 9.7,
  description: "Мутный IPA",
  authorNotes: "Добавить сухое охмеление",
  processMeta: defaultRecipeProcessMeta,
  fgEstimateMode: "yeast_estimate",
  fgEstimateDetails: {
    baseAttenuationPct: 78,
    attenuationSource: "yeast",
    mainMashTempC: 66,
    mashAdjPctPoints: 0.75,
    simpleSugarSharePct: 0,
    crystalDextrinSharePct: 8,
    lactoseSharePct: 0,
    simpleSugarAdj: 0,
    crystalDextrinAdj: 0.8,
    lactoseAdj: 0,
    effectiveAttenuationPct: 77.95,
    fgRangeMin: 1.01,
    fgRangeMax: 1.014
  },
  heroImageId: null,
  rating: null,
  versions: [{ id: "r-1", versionNumber: 1, updatedAt: new Date("2026-01-02T00:00:00.000Z") }],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  ingredients: [
    {
      id: "ri-0",
      recipeId: "r-1",
      persistentKey: "00000000-0000-4000-8000-000000000010",
      displayOrder: 0,
      ingredientCatalogItemId: "cat-0",
      userCustomIngredientId: null,
      type: "fermentable",
      ingredientCategory: "fermentable",
      ingredientSubtype: "malt",
      ingredientDisplayName: "Pilsner Malt",
      ingredientDisplayNameRu: "Пилснер солод",
      ingredientBrand: "Castle Malting",
      ingredientCountryCode: "BE",
      ingredientCountryName: "Бельгия",
      ingredientDefaultDisplayUnitSnapshot: "g",
      ingredientTechnicalData: {
        type: "malt",
        colorEbcMin: 5,
        colorEbcMax: 8,
        extractPctDryBasis: 80
      },
      amountEnteredQuantity: 500,
      amountEnteredUnit: "g",
      amountNormalizedQuantity: 500,
      amountNormalizedUnit: "g",
      stage: "mash",
      timeOffset: null,
      stepMeta: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    },
    {
      id: "ri-1",
      recipeId: "r-1",
      persistentKey: "00000000-0000-4000-8000-000000000011",
      displayOrder: 1,
      ingredientCatalogItemId: "cat-1",
      userCustomIngredientId: null,
      type: "hop",
      ingredientCategory: "hop",
      ingredientSubtype: "hop",
      ingredientDisplayName: "Citra",
      ingredientBrand: "Yakima Chief",
      ingredientCountryCode: "US",
      ingredientCountryName: "США",
      ingredientTechnicalData: {
        type: "hop",
        alphaAcidPctTypical: 12.5,
        hopForm: "pellet"
      },
      amountEnteredQuantity: 50,
      amountEnteredUnit: "g",
      amountNormalizedQuantity: 50,
      amountNormalizedUnit: "g",
      stage: "boil",
      timeOffset: 30,
      stepMeta: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    }
  ]
};

describe("recipes read components", () => {
  it("renders empty state", () => {
    const html = renderToStaticMarkup(React.createElement(RecipeEmptyState));

    expect(html).toContain("Пока нет рецептов");
    expect(html).toContain("Создать рецепт");
  });

  it("renders stats summary", () => {
    const html = renderToStaticMarkup(React.createElement(RecipeStatsSummary, { recipe: recipeDetail }));

    expect(html).toContain("Ключевые показатели");
    expect(html).toContain("OG");
    expect(html).not.toContain("Прогноз по умолчанию");
    expect(html).not.toContain("Ручная attenuation");
    expect(html).not.toContain("Ручной FG");
    expect(html).toContain("ABV");
    expect(html).toContain("IBU");
  });

  it("shows only the compact default FG label for fallback estimates", () => {
    const html = renderToStaticMarkup(React.createElement(RecipeStatsSummary, {
      recipe: {
        ...recipeDetail,
        fgEstimateMode: "default_estimate",
        fgEstimateDetails: {
          ...recipeDetail.fgEstimateDetails!,
          attenuationSource: "default",
          baseAttenuationPct: 75
        }
      }
    }));

    expect(html).toContain("Прогноз по умолчанию");
    expect(html).not.toContain("прогноз по дрожжам");
    expect(html).not.toContain("прогноз по умолчанию • атт. 75%");
  });

  it("renders style-linked stats as numeric summary without range graph", () => {
    const html = renderToStaticMarkup(React.createElement(RecipeStatsSummary, {
      recipe: {
        ...recipeDetail,
        styleId: "american-pale-ale"
      }
    }));

    expect(html).toContain("BJCP:");
    expect(html).toContain("Ключевые показатели");
    expect(html).not.toContain("Соответствие стилю");
  });

  it("renders ingredients and meta sections", () => {
    const html = renderToStaticMarkup(
      React.createElement("div", null,
        React.createElement(RecipeIngredientsSection, { ingredients: recipeDetail.ingredients }),
        React.createElement(RecipeMetaSection, { recipe: recipeDetail })
      )
    );

    expect(html).toContain("Ингредиенты");
    expect(html).toContain("Pilsner Malt");
    expect(html).toContain("Castle Malting");
    expect(html).toContain("5-8 EBC");
    expect(html).toContain("Экст-ть 80%");
    expect(html).toContain("Citra");
    expect(html).toContain("Yakima Chief");
    expect(html).toContain("Альфа 12.5%");
    expect(html).toContain("Гранулы");
    expect(html).toContain("0.5 kg");
    expect(html).toContain("Кипячение");
    expect(html).toContain("Описание");
    expect(html).toContain("Личные заметки");
  });

  it("keeps EBC accent badges for non-malt fermentables in recipe ingredient cards", () => {
    const badges = buildRecipeIngredientTechnicalBadges({
      technicalData: {
        type: "fermentable",
        colorEbcMin: 12,
        colorEbcMax: 12,
        extractPctDryBasis: 79
      }
    });

    expect(badges.map((badge) => badge.label)).toEqual([
      "12 EBC",
      "Экст-ть 79%"
    ]);
    expect(badges[0]?.accent).toMatchObject({
      startHex: expect.any(String),
      averageHex: expect.any(String),
      endHex: expect.any(String)
    });
  });

  it("renders water treatment formulas in recipe ingredient cards", () => {
    const badges = buildRecipeIngredientTechnicalBadges({
      technicalData: {
        type: "water_treatment",
        formula: "CaSO4",
        calculationFormula: "CaSO4·2H2O",
        unitPreferred: "g"
      }
    });

    expect(badges.map((badge) => badge.label)).toEqual(["CaSO4"]);
  });

  it("can suppress catalog usage badges for consumables in recipe cards", () => {
    const badges = buildRecipeIngredientTechnicalBadges({
      technicalData: {
        type: "consumable",
        commonForms: ["dried_peel"],
        usageStage: ["boil"]
      }
    }, { includeConsumableUsageStage: false });

    expect(badges.map((badge) => badge.label)).toEqual(["Сушеная цедра"]);
  });

  it("renders public recipe page composition", () => {
    const html = renderToStaticMarkup(React.createElement(PublicRecipePage, { recipe: recipeDetail }));

    expect(html).toContain("Публичный");
    expect(html).toContain("Ключевые показатели");
    expect(html).toContain("Ингредиенты");
    expect(html).toContain("Изображение");
  });

  it("renders route-level error states", () => {
    const listErrorHtml = renderToStaticMarkup(React.createElement(RecipesError, { error: new Error("boom"), reset: () => undefined }));
    const detailErrorHtml = renderToStaticMarkup(React.createElement(RecipeDetailError, { error: new Error("boom"), reset: () => undefined }));
    const publicErrorHtml = renderToStaticMarkup(React.createElement(PublicRecipeError, { error: new Error("boom"), reset: () => undefined }));
    const publicNotFoundHtml = renderToStaticMarkup(React.createElement(PublicRecipeNotFound));
    const publicListErrorHtml = renderToStaticMarkup(React.createElement(PublicRecipesError, { error: new Error("boom"), reset: () => undefined }));

    expect(listErrorHtml).toContain("Не удалось загрузить");
    expect(detailErrorHtml).toContain("Не удалось загрузить рецепт");
    expect(detailErrorHtml).toContain("Повторить");
    expect(publicErrorHtml).toContain("Не удалось загрузить публичный рецепт");
    expect(publicListErrorHtml).toContain("Не удалось загрузить публичные рецепты");
    expect(publicNotFoundHtml).toContain("Рецепт не найден");
  });
});
