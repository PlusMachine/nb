import { readFileSync } from "node:fs";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import NewRecipePage from "../app/(app)/app/recipes/new/page";
import EditRecipePage from "../app/(app)/app/recipes/[id]/edit/page";
import { RecipeEditorErrorState } from "../components/recipes/recipe-editor-error-state";
import { buildImportRecipeSummary } from "../components/recipes/import-export-modal";
import {
  RecipeDesigner,
  resolveRecipeIngredientEditorSourceMode,
  resolveRecipeIngredientSearchType
} from "../components/recipes/recipe-designer";
import { RecipeIngredientsEditor } from "../components/recipes/recipe-ingredients-editor";
import { StartBrewModal } from "../components/recipes/start-brew-modal";
import {
  applyRecipeIngredientCategoryChange,
  applyRecipeIngredientSelection,
  applyRecipeIngredientTextChange,
  getRecipeIngredientValidationError,
  RecipeIngredientRow
} from "../components/recipes/recipe-ingredient-row";
import { RecipeStatsPreview } from "../components/recipes/recipe-stats-preview";
import { buildRecipePublicationChecklist } from "../features/recipes/publication-validation";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/recipes/new",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams()
}));

vi.mock("../app/(app)/app/recipes/actions", () => ({
  createRecipeAction: vi.fn(),
  updateRecipeAction: vi.fn(),
  createRecipeVersionAction: vi.fn(),
  createBrewBatchFromRecipeAction: vi.fn(),
  consumeRecipeInventoryAction: vi.fn(),
  previewRecipeDraftAction: vi.fn(),
  createRecipeCustomIngredientAction: vi.fn(),
  exportRecipeBeerXmlAction: vi.fn(),
  getEquipmentProfileSnapshotAction: vi.fn(),
  getRecipeStockCoverageAction: vi.fn(),
  importBeerXmlRecipeAction: vi.fn(),
  importBrewfatherJsonRecipeAction: vi.fn(),
  releaseRecipeInventoryAction: vi.fn(),
  reserveRecipeInventoryAction: vi.fn(),
  syncRecipeInventoryAllocationsAction: vi.fn(),
  proposeRecipeIngredientAction: vi.fn()
}));

const buildRow = (overrides: Partial<Parameters<typeof getRecipeIngredientValidationError>[0]> = {}) => ({
  localId: "1",
  ingredientCatalogItemId: null,
  userCustomIngredientId: null,
  selectedName: "",
  selectedSecondaryName: "",
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
  it("builds import summary from BeerXML content", () => {
    const beerXml = readFileSync(new URL("../../../ingredients/examples_for_import/neipa_hazy_orbit.checked.beerxml", import.meta.url), "utf8");
    const result = buildImportRecipeSummary("beerxml", beerXml);

    expect(result?.ok).toBe(true);
    if (result?.ok) {
      expect(result.summary.title).toBe("Hazy Orbit NEIPA");
      expect(result.summary.ingredientCountLabel).toMatch(/\d+ поз\./);
      expect(result.summary.ingredientBreakdown).toContain("хмель");
      expect(result.summary.parameters).toContain("л");
    }
  });

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
    expect(html).toContain('step="0.1"');
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
      ingredientCatalogItemId: "hop-cascade",
      selectedName: "Cascade",
      amountEnteredQuantity: "",
      timeOffset: ""
    }))).toContain("Укажите количество");
  });

  it("selection wiring stores category and taxonomy linkage", () => {
    const selected = applyRecipeIngredientSelection(buildRow(), {
      id: "cat-1",
      type: "hop",
      category: "hop",
      subtype: "hop",
      familyId: null,
      familyDisplayName: null,
      displayName: "Cascade",
      subtitle: "Yakima Chief • 6.8% AA",
      defaultUnit: "g",
      defaultDisplayUnit: "g",
      allowedUnits: ["g", "kg", "oz", "lb"],
      measurementDimension: "weight",
      source: "catalog"
    });

    expect(selected.ingredientCatalogItemId).toBe("cat-1");
    expect(selected.familyId).toBeNull();
    expect(selected.subtype).toBe("hop");
    expect(selected.amountEnteredUnit).toBe("g");
    expect(selected.selectedSecondaryName).toBe("");
  });

  it("fermentable selection prefers kilograms for human-facing recipe entry", () => {
    const selected = applyRecipeIngredientSelection(buildRow({
      category: "fermentable",
      type: "malt",
      defaultDisplayUnit: "kg",
      selectedName: ""
    }), {
      id: "cat-fermentable",
      type: "malt",
      category: "fermentable",
      subtype: "malt",
      familyId: null,
      familyDisplayName: null,
      displayName: "Pilsner Malt",
      subtitle: "3.5 Lovibond • 80% extract",
      defaultUnit: "g",
      defaultDisplayUnit: "g",
      allowedUnits: ["g", "kg", "oz", "lb"],
      measurementDimension: "weight",
      source: "catalog"
    });

    expect(selected.amountEnteredUnit).toBe("kg");
    expect(selected.defaultDisplayUnit).toBe("kg");
  });

  it("fermentable recipe searches include malt and generic fermentables", () => {
    expect(resolveRecipeIngredientSearchType({
      category: "fermentable",
      type: "fermentable"
    })).toBeUndefined();
    expect(resolveRecipeIngredientSearchType({
      category: "fermentable",
      type: "malt"
    })).toBeUndefined();
    expect(resolveRecipeIngredientSearchType({
      category: "hop",
      type: "hop"
    })).toBe("hop");
  });

  it("recipe ingredient editor keeps custom source mode distinct from catalog", () => {
    expect(resolveRecipeIngredientEditorSourceMode("use_stock")).toBe("use_stock");
    expect(resolveRecipeIngredientEditorSourceMode("custom")).toBe("custom");
    expect(resolveRecipeIngredientEditorSourceMode("catalog")).toBe("catalog");
    expect(resolveRecipeIngredientEditorSourceMode("imported")).toBe("catalog");
  });

  it("changing text after selection clears stale linkage", () => {
    const selected = buildRow({
      ingredientCatalogItemId: "cat-1",
      selectedName: "Cascade",
      selectedSecondaryName: "Каскад",
      selectedSummary: "Yakima Chief • 6.8% AA",
      familyDisplayName: "",
      familyId: null,
      subtype: "hop"
    });
    const cleared = applyRecipeIngredientTextChange(selected, "Cascade local");

    expect(cleared.ingredientCatalogItemId).toBeNull();
    expect(cleared.familyId).toBeNull();
    expect(cleared.selectedSecondaryName).toBe("");
    expect(cleared.selectedSummary).toBe("");
  });

  it("changing category resets incompatible selection state", () => {
    const next = applyRecipeIngredientCategoryChange(buildRow({
      ingredientCatalogItemId: "cat-1",
      selectedName: "Cascade",
      familyId: null
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
          batchSizeEnteredUnit: "l",
          styleId: null
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

  it("start brew modal renders a visible success state", () => {
    const html = renderToStaticMarkup(
      React.createElement(StartBrewModal, {
        open: true,
        pending: false,
        result: {
          ok: true,
          message: "Партия создана. Пошаговый режим варки появится здесь позже.",
          brewBatchId: "batch-1"
        },
        onStart: () => undefined,
        onClose: () => undefined
      })
    );

    expect(html).toContain("Партия добавлена в план варки.");
    expect(html).toContain("Закрыть");
    expect(html).not.toContain("Списать ингредиенты со склада");
  });

  it("designer header renders aligned field labels", () => {
    const html = renderToStaticMarkup(React.createElement(RecipeDesigner, { mode: "create" }));

    expect(html).toContain("Название рецепта");
    expect(html).toContain("Стиль BJCP");
    expect(html).toContain("Оборудование");
    expect(html).toContain("Вода");
    expect(html).toContain("Покрытие складом");
    expect(html).toContain("Прочее / расходники");
    expect(html).toContain("Импорт / экспорт");
    expect(html).toContain("Начать варку");
    expect(html).toContain("Mash Profile");
    expect(html).toContain("(0)");
    expect(html).not.toContain('value="67"');
    expect(html).not.toContain("Equipment profile");
    expect(html).not.toContain("Brew mode");
    expect(html).not.toContain("foundation");
    expect(html).not.toContain("snapshot");
    expect(html).not.toContain("Сохранить");
    expect(html).not.toContain("Публикация");
  });

  it("builds publication readiness checklist for publish action", () => {
    const checklist = buildRecipePublicationChecklist({
      publicationState: "published",
      title: "Новый рецепт 1",
      styleId: null,
      description: "",
      boilTimeMinutes: 60,
      ingredientCategories: ["fermentable", "hop"]
    });

    expect(checklist.find((item) => item.key === "title")?.isSatisfied).toBe(true);
    expect(checklist.find((item) => item.key === "styleId")).toMatchObject({
      isSatisfied: false,
      statusLabel: "Не заполнено"
    });
    expect(checklist.find((item) => item.key === "description")).toMatchObject({
      isSatisfied: false,
      statusLabel: "Не заполнено"
    });
    expect(checklist.find((item) => item.key === "ingredients.yeast")).toMatchObject({
      isSatisfied: false,
      statusLabel: "Не добавлено"
    });
  });

  it("create and edit pages are importable", () => {
    expect(typeof NewRecipePage).toBe("function");
    expect(typeof EditRecipePage).toBe("function");
  });
});
