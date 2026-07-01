import { readFileSync } from "node:fs";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import NewRecipePage from "../app/(app)/app/recipes/new/page";
import EditRecipePage from "../app/(app)/app/recipes/[id]/edit/page";
import { RecipeEditorErrorState } from "../components/recipes/recipe-editor-error-state";
import { buildImportRecipeSummary } from "../components/recipes/import-export-modal";
import { CustomIngredientForm } from "../components/inventory/custom-ingredient-form";
import {
  RecipeDesigner,
  buildRecipeStockIngredientSearchParams,
  buildRecipeEditorResumeHref,
  buildRecipeEditHref,
  buildRecipeWizardResumeHref,
  applyRecipeWaterAddFlowSaltToWaterPlan,
  resolveRecipeFermentablePickerScopeContext,
  resolveRecipeIngredientForcedGroup,
  resolveRecipeIngredientEditorSourceMode,
  resolveRecipeIngredientSearchType,
  resolveRecipeWaterManualSaltAdditionFromIngredient,
  resolveRecipeConsumableDefaultStage,
  resolveRecipeConsumableStageOptions,
  filterRecipeWaterAddFlowSuggestions,
  recipeConsumableAdditiveGroup,
  recipeConsumableSubtypeOptions,
  shouldAutoFocusRecipeIngredientPicker
} from "../components/recipes/recipe-designer";
import { createRecipeWaterPlanResetMeta } from "../components/recipes/water-setup-wizard";
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
import type { EquipmentProfileDto } from "../features/equipment-profiles/contracts";
import type { IngredientSuggestionItem } from "../features/ingredients/contracts";
import { defaultRecipeProcessMeta, type RecipeDetailDto, type RecipeWaterPlanMeta } from "../features/recipes/contracts";
import { buildRecipePublicationChecklist } from "../features/recipes/publication-validation";
import { buildRecipeWaterPlanResult } from "../features/recipes/water-plan";

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

const buildRecipeDetail = (overrides: Partial<RecipeDetailDto> = {}): RecipeDetailDto => ({
  id: "recipe-1",
  authorId: "user-1",
  recipeFamilyId: "family-1",
  versionNumber: 1,
  versionCount: 1,
  publicationState: "private",
  title: "Тестовый рецепт",
  slug: "test-recipe",
  styleId: null,
  batchSizeEnteredQuantity: 20,
  batchSizeEnteredUnit: "l",
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  efficiency: 75,
  boilTimeMinutes: 60,
  og: null,
  fg: null,
  abv: null,
  ibu: null,
  color: null,
  createdAt: new Date("2026-04-20T10:00:00Z"),
  updatedAt: new Date("2026-04-20T10:00:00Z"),
  description: null,
  authorNotes: null,
  processMeta: defaultRecipeProcessMeta,
  calculationMeta: null,
  heroImageId: null,
  rating: null,
  ingredients: [],
  versions: [],
  ...overrides
});

const buildEquipmentProfile = (overrides: Partial<EquipmentProfileDto> = {}): EquipmentProfileDto => ({
  id: "profile-1",
  userId: "user-1",
  name: "Клон Braumeister",
  targetBatchVolumeL: 27,
  brewhouseEfficiencyPct: 72,
  evaporationRateLPerHr: 3,
  trubChillerLossL: 1,
  fermenterLossL: 0,
  grainAbsorptionLPerKg: 0.8,
  coolingShrinkagePct: 4,
  mashThicknessLPerKg: 3,
  maxMashVolumeL: null,
  maxKettleVolumeL: null,
  hopUtilizationFactor: 1,
  altitudeM: 0,
  notes: null,
  isDefault: true,
  createdAt: new Date("2026-04-20T10:00:00Z"),
  updatedAt: new Date("2026-04-20T10:00:00Z"),
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

  it("maps merged recipe fermentable filters to subtype and group search context", () => {
    expect(resolveRecipeFermentablePickerScopeContext("malt")).toEqual({
      subtype: "malt",
      group: null,
      label: "Солод"
    });

    expect(resolveRecipeFermentablePickerScopeContext("adjunct_grains")).toEqual({
      subtype: "fermentable",
      group: "adjunct_grains",
      label: "Неосоложенка"
    });

    expect(resolveRecipeFermentablePickerScopeContext("sugars_and_syrups")).toEqual({
      subtype: "fermentable",
      group: "sugars_and_syrups",
      label: "Сахара и сиропы"
    });

    expect(resolveRecipeFermentablePickerScopeContext(null)).toEqual({
      subtype: null,
      group: null,
      label: null
    });
  });

  it("recipe ingredient editor keeps custom source mode distinct from catalog", () => {
    expect(resolveRecipeIngredientEditorSourceMode("use_stock")).toBe("use_stock");
    expect(resolveRecipeIngredientEditorSourceMode("custom")).toBe("custom");
    expect(resolveRecipeIngredientEditorSourceMode("catalog")).toBe("catalog");
    expect(resolveRecipeIngredientEditorSourceMode("imported")).toBe("catalog");
  });

  it("scopes recipe consumables to the inventory other-additives group", () => {
    expect(resolveRecipeIngredientForcedGroup({
      category: "consumable",
      fermentableGroup: null
    })).toMatchObject({
      label: "Другие добавки",
      value: recipeConsumableAdditiveGroup
    });

    expect(recipeConsumableSubtypeOptions).toEqual([
      "technical_additives",
      "lauter_aid",
      "spice",
      "citrus_zest",
      "herb_flower",
      "coffee_cacao",
      "wood_aging",
      "flavoring",
      "other"
    ]);

    const params = buildRecipeStockIngredientSearchParams({
      q: "",
      type: "consumable",
      category: "consumable",
      group: recipeConsumableAdditiveGroup,
      limit: 13
    });

    expect(params.get("group")).toBe("inventory_additives");
    expect(params.get("category")).toBe("consumable");
    expect(params.get("type")).toBe("consumable");
    expect(params.get("stock")).toBe("in_stock");
  });

  it("keeps recipe water add-flow suggestions limited to additives supported by the water wizard", () => {
    const items = [
      {
        id: "calcium-chloride-anhydrous",
        category: "water_treatment",
        source: "catalog",
        displayName: "Хлорид кальция (безводный)"
      },
      {
        id: "epsom-salt",
        category: "water_treatment",
        source: "catalog",
        displayName: "Эпсомская соль"
      },
      {
        id: "gypsum",
        category: "water_treatment",
        source: "catalog",
        displayName: "Гипс"
      },
      {
        id: "potassium-metabisulfite",
        category: "water_treatment",
        source: "catalog",
        displayName: "Метабисульфит калия"
      },
      {
        id: "lactic-acid",
        category: "water_treatment",
        source: "catalog",
        displayName: "Молочная кислота"
      },
      {
        id: "lactic-acid-custom",
        category: "water_treatment",
        source: "custom",
        displayName: "Своя молочная кислота"
      }
    ] as IngredientSuggestionItem[];

    expect(filterRecipeWaterAddFlowSuggestions(items).map((item) => item.id)).toEqual([
      "gypsum",
      "epsom-salt"
    ]);
  });

  it("maps recipe water add-flow salts into manual water-plan additions", () => {
    const baseMeta = createRecipeWaterPlanResetMeta();
    const baseResult = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      waterPlanMeta: baseMeta
    });
    const addition = resolveRecipeWaterManualSaltAdditionFromIngredient({
      category: "water_treatment",
      ingredientCatalogItemId: "sodium-chloride",
      amountEnteredQuantity: "2",
      amountEnteredUnit: "g"
    });

    expect(addition).toEqual({
      salt: "table_salt",
      grams: 2,
      target: "all"
    });
    expect(resolveRecipeWaterManualSaltAdditionFromIngredient({
      category: "water_treatment",
      ingredientCatalogItemId: "lactic-acid",
      amountEnteredQuantity: "1",
      amountEnteredUnit: "ml"
    })).toBeNull();

    const nextMeta = applyRecipeWaterAddFlowSaltToWaterPlan({
      waterPlanMeta: baseMeta,
      waterPlanResult: baseResult,
      ingredient: {
        category: "water_treatment",
        ingredientCatalogItemId: "sodium-chloride",
        amountEnteredQuantity: "2",
        amountEnteredUnit: "g"
      }
    });

    expect(nextMeta?.setupEnabled).toBe(true);
    expect(nextMeta?.engine).toBe("advanced_manual");
    expect(nextMeta?.manualSaltAdditions).toEqual([
      { salt: "table_salt", grams: 2, target: "all" }
    ]);

    const nextResult = buildRecipeWaterPlanResult({
      fallbackBatchVolumeL: 20,
      grainKg: 5,
      waterPlanMeta: nextMeta!
    });

    expect(nextResult.finalProfile.na).toBeGreaterThan(baseResult.finalProfile.na);
    expect(nextResult.finalProfile.cl).toBeGreaterThan(baseResult.finalProfile.cl);
  });

  it("shows the water salt add action without requiring a separate salt mode", () => {
    const autoWaterPlanMeta = {
      ...createRecipeWaterPlanResetMeta(),
      setupEnabled: true,
      engine: "profile_only",
    } satisfies RecipeWaterPlanMeta;
    const manualWaterPlanMeta = {
      ...autoWaterPlanMeta,
      engine: "advanced_manual",
    } satisfies RecipeWaterPlanMeta;

    const autoHtml = renderToStaticMarkup(React.createElement(RecipeDesigner, {
      mode: "edit",
      initialRecipe: buildRecipeDetail({ waterPlanMeta: autoWaterPlanMeta }),
      preferredGravityUnit: "plato",
    }));
    const manualHtml = renderToStaticMarkup(React.createElement(RecipeDesigner, {
      mode: "edit",
      initialRecipe: buildRecipeDetail({ waterPlanMeta: manualWaterPlanMeta }),
      preferredGravityUnit: "plato",
    }));

    expect(autoHtml).toContain("Водоподготовка");
    expect(autoHtml).toContain("Добавить соль");
    expect(manualHtml).toContain("Добавить соль");
    expect(autoHtml.match(/Добавить соль/g)).toHaveLength(1);
    expect(manualHtml.match(/Добавить соль/g)).toHaveLength(1);
    expect(autoHtml).not.toContain("Добавить соль вручную");
    expect(manualHtml).not.toContain("Добавить соль вручную");
  });

  it("maps recipe consumable usage stages into add-flow stage options", () => {
    const citrusTechnicalData = {
      type: "consumable" as const,
      commonForms: ["dried_peel"],
      usageStage: ["boil", "flameout", "primary", "secondary", "bottling"]
    };

    expect(resolveRecipeConsumableStageOptions(citrusTechnicalData)).toEqual([
      "boil",
      "whirlpool",
      "fermentation",
      "packaging",
      "other"
    ]);
    expect(resolveRecipeConsumableDefaultStage(citrusTechnicalData)).toBe("boil");

    const lauterAidTechnicalData = {
      type: "consumable" as const,
      commonForms: ["husk"],
      usageStage: ["mash"]
    };

    expect(resolveRecipeConsumableStageOptions(lauterAidTechnicalData)).toEqual(["mash", "other"]);
    expect(resolveRecipeConsumableDefaultStage(lauterAidTechnicalData)).toBe("mash");
    expect(resolveRecipeConsumableDefaultStage(null)).toBe("other");
  });

  it("keeps recipe custom consumables inside other-additive subtypes", () => {
    const html = renderToStaticMarkup(React.createElement(CustomIngredientForm, {
      mode: "recipe",
      category: "consumable",
      subtypeOptions: recipeConsumableSubtypeOptions,
      pending: false,
      onSubmit: async () => undefined
    }));

    expect(html).toContain("техдобавка");
    expect(html).toContain("фильтрация затора");
    expect(html).toContain("специя");
    expect(html).toContain("цедра и цитрус");
    expect(html).toContain("ароматизатор");
    expect(html).not.toContain("санитайзер");
    expect(html).not.toContain("моющее средство");
    expect(html).not.toContain("тара и укупорка");
    expect(html).not.toContain(">газ<");
  });

  it("auto-focuses the picker when matching an imported ingredient to catalog", () => {
    const importedIngredient = {
      inventoryIntentMode: "catalog",
      ingredientCatalogItemId: null,
      userCustomIngredientId: null,
      externalImportMeta: {
        importedIngredient: {
          version: 1,
          name: "Imported Cascade"
        }
      }
    } as unknown as Parameters<typeof shouldAutoFocusRecipeIngredientPicker>[0]["ingredient"];

    expect(shouldAutoFocusRecipeIngredientPicker({
      ingredient: importedIngredient,
      hasSelectedPreview: false,
      sourceMode: "catalog"
    })).toBe(true);

    expect(shouldAutoFocusRecipeIngredientPicker({
      ingredient: importedIngredient,
      hasSelectedPreview: true,
      sourceMode: "catalog"
    })).toBe(false);

    expect(shouldAutoFocusRecipeIngredientPicker({
      ingredient: importedIngredient,
      hasSelectedPreview: false,
      sourceMode: "use_stock"
    })).toBe(false);

    expect(shouldAutoFocusRecipeIngredientPicker({
      ingredient: {
        ...importedIngredient,
        externalImportMeta: null
      } as unknown as Parameters<typeof shouldAutoFocusRecipeIngredientPicker>[0]["ingredient"],
      hasSelectedPreview: false,
      sourceMode: "catalog"
    })).toBe(false);
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
    expect(html).toContain("НП");
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
    const html = renderToStaticMarkup(React.createElement(RecipeDesigner, { mode: "create", preferredGravityUnit: "plato" }));

    expect(html).toContain("Название рецепта");
    expect(html).toContain("Стиль BJCP");
    expect(html).toContain("Оборудование");
    expect(html).toContain("Без профиля — ручной ввод параметров");
    expect(html).not.toContain("Профиль не выбран. Параметры задаются вручную.");
    expect(html).not.toContain("На основе профиля оборудования");
    expect(html).not.toContain("Значения сохраняются в рецепте");
    expect(html).toContain("Водоподготовка");
    expect(html).toContain("Ингредиенты со склада");
    expect(html).toContain("Другие добавки");
    expect(html).toContain("Импорт / экспорт");
    expect(html).toContain("Начать варку");
    expect(html).toContain("Mash Profile");
    expect(html).toContain("aria-label=\"Открыть настройки КП\"");
    expect(html).toContain("(0)");
    expect(html).not.toContain('value="67"');
    expect(html).not.toContain("Equipment profile");
    expect(html).not.toContain("Brew mode");
    expect(html).not.toContain("foundation");
    expect(html).not.toContain("snapshot");
    expect(html).not.toContain("FG / КП");
    expect(html).not.toContain("Ожидаемая attenuation, %");
    expect(html).not.toContain("Зафиксировать КП вручную");
    expect(html).not.toContain("Сохранить");
    expect(html).not.toContain("Публикация");
  });

  it("renders manually added water treatments with the water-additive card style", () => {
    const html = renderToStaticMarkup(React.createElement(RecipeDesigner, {
      mode: "edit",
      initialRecipe: buildRecipeDetail({
        ingredients: [{
          id: "ri-water",
          recipeId: "recipe-1",
          persistentKey: "00000000-0000-4000-8000-000000000099",
          displayOrder: 0,
          ingredientCatalogItemId: "gypsum",
          userCustomIngredientId: null,
          type: "water_treatment",
          ingredientCategory: "water_treatment",
          ingredientSubtype: "salt",
          ingredientDisplayName: "Гипс",
          ingredientTechnicalData: {
            type: "water_treatment",
            formula: "CaSO4",
            calculationFormula: "CaSO4·2H2O",
            unitPreferred: "g",
          },
          amountEnteredQuantity: 2,
          amountEnteredUnit: "g",
          amountNormalizedQuantity: 2,
          amountNormalizedUnit: "g",
          stage: "mash",
          timeOffset: null,
          stepMeta: null,
          createdAt: new Date("2026-04-20T10:00:00Z"),
          updatedAt: new Date("2026-04-20T10:00:00Z"),
        }],
      }),
      preferredGravityUnit: "plato",
    }));

    expect(html).toContain("Гипс");
    expect(html).toContain("CaSO4");
    expect(html).toContain("Из каталога");
    expect(html).toContain("border-l-sky-400");
    expect(html).not.toContain("hover:shadow-md");
  });

  it("marks selected BJCP styles without fixed ranges in the recipe stat tracks", () => {
    const html = renderToStaticMarkup(React.createElement(RecipeDesigner, {
      mode: "edit",
      initialRecipe: buildRecipeDetail({
        styleId: "34A",
        og: 1.052,
        fg: 1.012,
        abv: 5.3,
        ibu: 24,
        color: 7
      }),
      preferredGravityUnit: "plato"
    }));

    expect(html).toContain("Специальное пиво по коммерческому образцу");
    expect(html).toContain("Диапазоны BJCP не указаны");
    expect(html).toContain("Диапазон не указан в BJCP");
  });

  it("uses the default equipment profile as the initial profile for a new recipe", () => {
    const html = renderToStaticMarkup(React.createElement(RecipeDesigner, {
      mode: "create",
      equipmentProfiles: [
        buildEquipmentProfile(),
        buildEquipmentProfile({
          id: "profile-2",
          name: "HERMS",
          targetBatchVolumeL: 20,
          brewhouseEfficiencyPct: 70,
          isDefault: false
        })
      ],
      preferredGravityUnit: "plato"
    }));

    expect(html).toContain("Клон Braumeister · Основной — 27 л · 72%");
    expect(html).toContain("HERMS");
    expect(html).not.toContain("Основано на профиле Клон Braumeister");
    expect(html).toContain('value="27"');
    expect(html).toContain('value="72"');
  });

  it("opens the empty boil hop additions group by default", () => {
    const html = renderToStaticMarkup(React.createElement(RecipeDesigner, { mode: "create", preferredGravityUnit: "plato" }));

    expect(html).toContain("Добавление на кипячение");
    expect(html).toContain("Добавьте хмель на кипячение");
    expect(html).toContain("Другие типы охмеления");
    expect(html.indexOf("Сухое охмеление")).toBeLessThan(html.indexOf("Whirlpool / Hopstand"));
    expect(html.indexOf("Whirlpool / Hopstand")).toBeLessThan(html.indexOf("Dip Hopping"));
    expect(html.indexOf("Dip Hopping")).toBeLessThan(html.indexOf("First Wort Hop"));
    expect(html.indexOf("First Wort Hop")).toBeLessThan(html.indexOf("Другое"));
  });

  it("builds canonical edit href for saved recipes", () => {
    expect(buildRecipeEditHref("recipe-1")).toBe("/app/recipes/recipe-1/edit");
  });

  it("builds stable wizard resume href for autosaved new recipes", () => {
    expect(buildRecipeWizardResumeHref("recipe-1")).toBe("/app/recipes/new?recipeId=recipe-1");
    expect(buildRecipeEditorResumeHref("recipe-1", "/app/recipes/new")).toBe("/app/recipes/new?recipeId=recipe-1");
    expect(buildRecipeEditorResumeHref("recipe-1", "/app/recipes/r-0/edit")).toBe("/app/recipes/recipe-1/edit");
  });

  it("shows the selected BJCP style as a native link in the stats heading", () => {
    const html = renderToStaticMarkup(React.createElement(RecipeDesigner, {
      mode: "edit",
      initialRecipe: buildRecipeDetail({
        styleId: "1A"
      }),
      preferredGravityUnit: "plato"
    }));

    expect(html).toContain("<span>Ваш рецепт и </span>");
    expect(html).toContain('href="/bjcp/bjcp-1a-american-light-lager"');
    expect(html).toContain(">BJCP Американский лёгкий лагер</span>");
    expect(html).not.toContain(">Ваш рецепт и BJCP Американский лёгкий лагер</span>");
    expect(html).not.toContain("BJCP 1A · Описание стиля");
    expect(html).not.toContain("Открыть стиль в справочнике");
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
