import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@nb/ui";

// PublicRecipePage → PublicRecipeHeader → RecipeSaveButton использует useRouter()/useToast().
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined })
}));

import RecipesError from "../app/(app)/app/recipes/error";
import RecipeDetailError from "../app/(app)/app/recipes/[id]/error";
import PublicRecipeError from "../app/(public)/recipes/[slug]/error";
import PublicRecipeNotFound from "../app/(public)/recipes/[slug]/not-found";
import PublicRecipesError from "../app/(public)/recipes/error";
import { RecipeEmptyState } from "../components/recipes/recipe-empty-state";
import { buildRecipeIngredientTechnicalBadges } from "../components/recipes/recipe-ingredient-card-display";
import { PublicRecipeHeader } from "../components/recipes/public-recipe-header";
import { PublicRecipePage } from "../components/recipes/public-recipe-page";
import { RecipeIngredientsSection } from "../components/recipes/recipe-ingredients-section";
import { RecipeMetaSection } from "../components/recipes/recipe-meta-section";
import { RecipeStatsSummary } from "../components/recipes/recipe-stats-summary";
import { SimilarRecipesSection } from "../components/recipes/similar-recipes-section";
import { defaultRecipeProcessMeta, type PublicRecipeListItem, type RecipeDetailDto } from "../features/recipes/contracts";

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
  authorDisplayName: null,
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
  completedBrewCount: 0,
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
    const html = renderToStaticMarkup(React.createElement(RecipeStatsSummary, { recipe: recipeDetail, preferredGravityUnit: "plato" }));

    expect(html).toContain("Ключевые показатели");
    expect(html).toContain("OG");
    expect(html).not.toContain("Прогноз по умолчанию");
    expect(html).not.toContain("Ручная attenuation");
    expect(html).not.toContain("Ручной FG");
    expect(html).toContain("ABV");
    expect(html).toContain("IBU");
    // Вторая (дублирующая) единица рядом с OG/FG — при основной Plato это SG.
    expect(html).toContain("1.061 SG");
    expect(html).toContain("1.012 SG");
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
      },
      preferredGravityUnit: "plato"
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
      },
      preferredGravityUnit: "plato"
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
    expect(html).toContain("0.5 кг");
    expect(html).toContain("Кипячение");
    expect(html).toContain("Описание");
    expect(html).toContain("Личные заметки");
  });

  it("не показывает дубль stage/useType, если они совпадают по смыслу (F7)", () => {
    const html = renderToStaticMarkup(
      React.createElement(RecipeIngredientsSection, {
        ingredients: [
          {
            ...recipeDetail.ingredients[1]!,
            id: "ri-boil-hop",
            stage: "boil",
            stepMeta: { useType: "boil" }
          }
        ]
      })
    );

    expect(html).not.toContain("boil");
    expect(html).not.toContain("Кипячение · Кипячение");
    expect(html).toContain("Кипячение");
  });

  it("показывает переведённый useType, когда он отличается от stage (F7)", () => {
    const html = renderToStaticMarkup(
      React.createElement(RecipeIngredientsSection, {
        ingredients: [
          {
            ...recipeDetail.ingredients[1]!,
            id: "ri-fwh-hop",
            stage: "boil",
            stepMeta: { useType: "first_wort_hop" }
          }
        ]
      })
    );

    expect(html).toContain("Первое сусло");
    expect(html).not.toContain("first_wort_hop");
  });

  it("не показывает голый en-токен для useType/use вне известного enum (F7)", () => {
    const html = renderToStaticMarkup(
      React.createElement(RecipeIngredientsSection, {
        ingredients: [
          {
            ...recipeDetail.ingredients[1]!,
            id: "ri-unknown-use",
            stage: "boil",
            stepMeta: { useType: "some_unknown_value" }
          }
        ]
      })
    );

    expect(html).not.toContain("some_unknown_value");
  });

  it("не дублирует «Вирпул», когда stage и useType совпадают по raw-ключу (F7-хвост)", () => {
    const html = renderToStaticMarkup(
      React.createElement(RecipeIngredientsSection, {
        ingredients: [
          {
            ...recipeDetail.ingredients[1]!,
            id: "ri-whirlpool-hop",
            stage: "whirlpool",
            stepMeta: { useType: "whirlpool" }
          }
        ]
      })
    );

    expect(html).toContain("Вирпул");
    expect(html).not.toContain("Вирпул / хопстенд");
    expect(html).not.toContain("Вирпул · Вирпул");
  });

  it("показывает «Вирпул / хопстенд», когда useType=whirlpool внесён на стадии boil (F7-хвост)", () => {
    const html = renderToStaticMarkup(
      React.createElement(RecipeIngredientsSection, {
        ingredients: [
          {
            ...recipeDetail.ingredients[1]!,
            id: "ri-boil-whirlpool-hop",
            stage: "boil",
            stepMeta: { useType: "whirlpool" }
          }
        ]
      })
    );

    expect(html).toContain("Вирпул / хопстенд");
  });

  it("links an ingredient with a catalog binding to /catalog/system/<id> (перелинковка M8)", () => {
    const html = renderToStaticMarkup(
      React.createElement(RecipeIngredientsSection, { ingredients: recipeDetail.ingredients })
    );

    expect(html).toContain('href="/catalog/system/cat-0"');
    expect(html).toContain('href="/catalog/system/cat-1"');
  });

  it("does not link a custom (non-catalog) ingredient to the public catalog", () => {
    const html = renderToStaticMarkup(
      React.createElement(RecipeIngredientsSection, {
        ingredients: [
          {
            ...recipeDetail.ingredients[0]!,
            id: "ri-custom",
            ingredientCatalogItemId: null,
            userCustomIngredientId: "11111111-1111-4111-8111-111111111111"
          }
        ]
      })
    );

    expect(html).not.toContain("/catalog/system/");
    expect(html).not.toContain("/catalog/custom/");
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
    const html = renderToStaticMarkup(
      React.createElement(ToastProvider, null, React.createElement(PublicRecipePage, { recipe: recipeDetail }))
    );

    expect(html).toContain("Публичный");
    expect(html).toContain("Ключевые показатели");
    expect(html).toContain("Ингредиенты");
    // Пустого плейсхолдера обложки больше нет; оценки рендерятся внизу страницы.
    expect(html).not.toContain("пока не добавлено");
    expect(html).toContain("Оценки");
  });

  it("links the style name in the recipe header to its BJCP article (перелинковка M8)", () => {
    const html = renderToStaticMarkup(
      React.createElement(ToastProvider, null, React.createElement(PublicRecipeHeader, {
        recipe: { ...recipeDetail, styleId: "21A" }
      }))
    );

    expect(html).toContain("American IPA");
    expect(html).toMatch(/<a[^>]+href="\/bjcp\/[^"]+"[^>]*>American IPA<\/a>/);
  });

  it("does not link the style name when the recipe has no resolvable style", () => {
    const html = renderToStaticMarkup(
      React.createElement(ToastProvider, null, React.createElement(PublicRecipeHeader, { recipe: recipeDetail }))
    );

    expect(html).not.toContain('href="/bjcp/');
  });

  const similarRecipeFixture = (overrides: Partial<PublicRecipeListItem> = {}): PublicRecipeListItem => ({
    id: "r-similar",
    slug: "similar-ipa",
    name: "Similar IPA",
    author: { id: "u-2", displayName: "Пётр", image: null },
    style: { code: "21A", name: "Американский IPA" },
    styleHref: "/bjcp/bjcp-21a-american-ipa",
    og: 1.06,
    fg: 1.012,
    abv: 6.2,
    ibu: 45,
    colorSrm: 9,
    colorEbc: 18,
    batchSizeL: 20,
    method: null,
    heroImage: null,
    styleImageUrl: null,
    cloneCount: 0,
    rating: null,
    featured: false,
    saveCount: 1,
    publishedAt: "2026-02-01T00:00:00.000Z",
    createdAt: "2026-02-01T00:00:00.000Z",
    ...overrides
  });

  it("renders the «Похожие рецепты» section with real links when recipes are provided", () => {
    const html = renderToStaticMarkup(
      React.createElement(ToastProvider, null, React.createElement(SimilarRecipesSection, {
        recipes: [similarRecipeFixture()]
      }))
    );

    expect(html).toContain("Похожие рецепты");
    expect(html).toContain('href="/recipes/similar-ipa"');
    expect(html).toContain("Similar IPA");
  });

  it("renders nothing for «Похожие рецепты» when the list is empty", () => {
    const html = renderToStaticMarkup(React.createElement(SimilarRecipesSection, { recipes: [] }));

    expect(html).toBe("");
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
