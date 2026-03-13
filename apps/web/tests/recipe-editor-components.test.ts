import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import NewRecipePage from "../app/(app)/app/recipes/new/page";
import EditRecipePage from "../app/(app)/app/recipes/[id]/edit/page";
import { RecipeEditorErrorState } from "../components/recipes/recipe-editor-error-state";
import { RecipeIngredientsEditor } from "../components/recipes/recipe-ingredients-editor";
import {
  applyRecipeIngredientCategoryChange,
  applyRecipeIngredientSelection,
  applyRecipeIngredientTextChange,
  getRecipeIngredientValidationError,
  RecipeIngredientRow
} from "../components/recipes/recipe-ingredient-row";
import { RecipeStatsPreview } from "../components/recipes/recipe-stats-preview";

const buildRow = (overrides: Partial<Parameters<typeof getRecipeIngredientValidationError>[0]> = {}) => ({
  localId: "1",
  ingredientCatalogItemId: null,
  userCustomIngredientId: null,
  selectedName: "",
  selectedSummary: "",
  familyDisplayName: "",
  category: "hop" as const,
  subtype: null,
  familyId: null,
  type: "hop" as const,
  defaultDisplayUnit: "g",
  allowedUnits: ["g", "kg", "oz", "lb"],
  measurementDimension: "weight",
  amountEnteredQuantity: "50",
  amountEnteredUnit: "g",
  stage: "boil" as const,
  timeOffset: "60",
  ...overrides
});

describe("recipe editor components", () => {
  it("ingredient row renders", () => {
    const html = renderToStaticMarkup(
      React.createElement(RecipeIngredientRow, {
        value: buildRow(),
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
    expect(getRecipeIngredientValidationError(buildRow({
      amountEnteredQuantity: "",
      timeOffset: ""
    }))).toContain("Выберите ингредиент");

    expect(getRecipeIngredientValidationError(buildRow({
      localId: "2",
      ingredientCatalogItemId: "00000000-0000-4000-8000-000000000001",
      selectedName: "Cascade",
      amountEnteredQuantity: "",
      timeOffset: ""
    }))).toContain("Укажите количество");
  });

  it("selection wiring stores category, subtype and family linkage", () => {
    const selected = applyRecipeIngredientSelection(buildRow(), {
      id: "cat-1",
      type: "hop",
      category: "hop",
      subtype: "pellet",
      familyId: "fam-1",
      familyDisplayName: "Cascade",
      displayName: "Yakima Chief Cascade",
      subtitle: "6.8% AA • pellet • 2024",
      defaultUnit: "g",
      defaultDisplayUnit: "g",
      allowedUnits: ["g", "kg", "oz", "lb"],
      measurementDimension: "weight",
      source: "catalog"
    });

    expect(selected.ingredientCatalogItemId).toBe("cat-1");
    expect(selected.familyId).toBe("fam-1");
    expect(selected.subtype).toBe("pellet");
    expect(selected.amountEnteredUnit).toBe("g");
  });

  it("fermentable selection prefers kilograms for human-facing recipe entry", () => {
    const selected = applyRecipeIngredientSelection(buildRow({
      category: "fermentable",
      type: "fermentable",
      defaultDisplayUnit: "kg",
      selectedName: ""
    }), {
      id: "cat-fermentable",
      type: "fermentable",
      category: "fermentable",
      subtype: "base_malt",
      familyId: "fam-fermentable",
      familyDisplayName: "Pilsner Malt",
      displayName: "Legacy Pilsner Malt",
      subtitle: "3.5 EBC • 80%",
      defaultUnit: "g",
      defaultDisplayUnit: "g",
      allowedUnits: ["g", "kg", "oz", "lb"],
      measurementDimension: "weight",
      source: "catalog"
    });

    expect(selected.amountEnteredUnit).toBe("kg");
    expect(selected.defaultDisplayUnit).toBe("kg");
  });

  it("changing text after selection clears stale linkage", () => {
    const selected = buildRow({
      ingredientCatalogItemId: "cat-1",
      selectedName: "Cascade",
      selectedSummary: "6.8% AA • pellet • 2024",
      familyDisplayName: "Cascade",
      familyId: "fam-1",
      subtype: "pellet"
    });
    const cleared = applyRecipeIngredientTextChange(selected, "Cascade local");

    expect(cleared.ingredientCatalogItemId).toBeNull();
    expect(cleared.familyId).toBeNull();
    expect(cleared.selectedSummary).toBe("");
  });

  it("changing category resets incompatible selection state", () => {
    const next = applyRecipeIngredientCategoryChange(buildRow({
      ingredientCatalogItemId: "cat-1",
      selectedName: "Cascade",
      familyId: "fam-1"
    }), "yeast");

    expect(next.category).toBe("yeast");
    expect(next.ingredientCatalogItemId).toBeNull();
    expect(next.selectedName).toBe("");
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
