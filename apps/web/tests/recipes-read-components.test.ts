import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import RecipesError from "../app/(app)/app/recipes/error";
import RecipeDetailError from "../app/(app)/app/recipes/[id]/error";
import PublicRecipeError from "../app/(public)/recipes/[slug]/error";
import PublicRecipeNotFound from "../app/(public)/recipes/[slug]/not-found";
import PublicRecipesError from "../app/(public)/recipes/error";
import { RecipeEmptyState } from "../components/recipes/recipe-empty-state";
import { PublicRecipePage } from "../components/recipes/public-recipe-page";
import { PublicRecipeList } from "../components/recipes/public-recipe-list";
import { RecipeIngredientsSection } from "../components/recipes/recipe-ingredients-section";
import { RecipeMetaSection } from "../components/recipes/recipe-meta-section";
import { RecipeStatsSummary } from "../components/recipes/recipe-stats-summary";
import type { RecipeDetailDto } from "../features/recipes/contracts";

const recipeDetail: RecipeDetailDto = {
  id: "r-1",
  authorId: "u-1",
  publicationState: "published",
  title: "Hazy IPA",
  slug: "public-ipa",
  styleId: null,
  batchSizeEnteredQuantity: 20,
  batchSizeEnteredUnit: "l",
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  efficiency: 75,
  og: 1.061,
  fg: 1.012,
  abv: 6.4,
  ibu: 42,
  color: 9.7,
  description: "Мутный IPA",
  authorNotes: "Добавить сухое охмеление",
  heroImageId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  ingredients: [
    {
      id: "ri-0",
      recipeId: "r-1",
      ingredientCatalogItemId: "cat-0",
      userCustomIngredientId: null,
      type: "fermentable",
      ingredientCategory: "fermentable",
      ingredientDisplayName: "Pilsner Malt",
      ingredientDefaultDisplayUnitSnapshot: "g",
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
      ingredientCatalogItemId: "cat-1",
      userCustomIngredientId: null,
      type: "hop",
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
    expect(html).toContain("ABV");
    expect(html).toContain("IBU");
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
    expect(html).toContain("0.5 kg");
    expect(html).toContain("Этап: Кипячение");
    expect(html).toContain("Описание");
    expect(html).toContain("Заметки автора");
  });

  it("renders public listing item with slug link", () => {
    const html = renderToStaticMarkup(React.createElement(PublicRecipeList, { recipes: [recipeDetail] }));

    expect(html).toContain("/recipes/");
    expect(html).toContain("Ключевые показатели");
  });

  it("renders public recipe page composition", () => {
    const html = renderToStaticMarkup(React.createElement(PublicRecipePage, { recipe: recipeDetail }));

    expect(html).toContain("Опубликован");
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
