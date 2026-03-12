import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import NewRecipePage from "../app/(app)/app/recipes/new/page";
import EditRecipePage from "../app/(app)/app/recipes/[id]/edit/page";
import { RecipeEditorErrorState } from "../components/recipes/recipe-editor-error-state";
import { RecipeIngredientsEditor } from "../components/recipes/recipe-ingredients-editor";
import { getRecipeIngredientValidationError, RecipeIngredientRow } from "../components/recipes/recipe-ingredient-row";
import { RecipeStatsPreview } from "../components/recipes/recipe-stats-preview";

describe("recipe editor components", () => {
  it("ingredient row renders", () => {
    const html = renderToStaticMarkup(
      React.createElement(RecipeIngredientRow, {
        value: {
          localId: "1",
          ingredientCatalogItemId: null,
          userCustomIngredientId: null,
          selectedName: "",
          type: "hop",
          amountEnteredQuantity: "50",
          amountEnteredUnit: "g",
          stage: "boil",
          timeOffset: "60"
        },
        onChange: () => undefined,
        title: "Новый ингредиент"
      })
    );

    expect(html).toContain("Ингредиент");
    expect(html).toContain("Новый ингредиент");
  });

  it("ingredients editor renders draft and saved sections", () => {
    const html = renderToStaticMarkup(
      React.createElement(RecipeIngredientsEditor, {
        rows: [],
        onChange: () => undefined
      })
    );

    expect(html).toContain("Добавить в рецепт");
    expect(html).toContain("Уже в рецепте");
  });

  it("ingredient validation requires selected ingredient and quantity", () => {
    expect(getRecipeIngredientValidationError({
      localId: "1",
      ingredientCatalogItemId: null,
      userCustomIngredientId: null,
      selectedName: "",
      type: "hop",
      amountEnteredQuantity: "",
      amountEnteredUnit: "g",
      stage: "boil",
      timeOffset: ""
    })).toContain("Выберите ингредиент");

    expect(getRecipeIngredientValidationError({
      localId: "2",
      ingredientCatalogItemId: "00000000-0000-4000-8000-000000000001",
      userCustomIngredientId: null,
      selectedName: "Cascade",
      type: "hop",
      amountEnteredQuantity: "",
      amountEnteredUnit: "g",
      stage: "boil",
      timeOffset: ""
    })).toContain("Укажите количество");
  });

  it("stats preview renders", () => {
    const html = renderToStaticMarkup(
      React.createElement(RecipeStatsPreview, {
        recipe: {
          og: 1.05,
          fg: 1.011,
          abv: 5.2,
          ibu: 28,
          color: 8,
          batchSizeEnteredQuantity: 20,
          batchSizeEnteredUnit: "l"
        }
      })
    );

    expect(html).toContain("Предпросмотр статистики");
    expect(html).toContain("OG");
    expect(html).toContain("20 l");
  });

  it("editor error state renders", () => {
    const html = renderToStaticMarkup(React.createElement(RecipeEditorErrorState, { message: "Ошибка валидации" }));
    expect(html).toContain("Ошибка валидации");
  });

  it("create and edit pages are importable", () => {
    expect(typeof NewRecipePage).toBe("function");
    expect(typeof EditRecipePage).toBe("function");
  });
});
