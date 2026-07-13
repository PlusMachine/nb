import { readFileSync } from "node:fs";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@nb/ui";

import NewRecipePage from "../app/(app)/app/recipes/new/page";
import EditRecipePage from "../app/(app)/app/recipes/[id]/edit/page";
import { RecipeEditorErrorState } from "../components/recipes/recipe-editor-error-state";
import { buildImportRecipeSummary, isImportExportModalDirty } from "../components/recipes/import-export-modal";
import { CustomIngredientForm } from "../components/inventory/custom-ingredient-form";
import {
  RecipeDesigner,
  buildRecipeStockIngredientSearchParams,
  buildRecipeEditorResumeHref,
  buildRecipeEditHref,
  buildRecipeWizardResumeHref,
  applyRecipeWaterAddFlowSaltToWaterPlan,
  applyHopUseTypeChange,
  buildRecipeDeleteConfirmDescription,
  createEmptyIngredient,
  isAutoRecipeTitle,
  isRecipeDraftWorthPersisting,
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
  shouldAutoFocusRecipeIngredientPicker,
  shouldShowRescaleToVolumeAction
} from "../components/recipes/recipe-designer";
import { createRecipeWaterPlanResetMeta } from "../components/recipes/water-setup-wizard";
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
import { formatGravityRange, formatGravitySecondary } from "../features/system/gravity-units";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/recipes/new",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams()
}));

// Складских экшенов (sync/reserve/consume/release/getStockCoverage) здесь больше нет:
// списание — операция варки, редактор рецепта в него не ходит (B1).
vi.mock("../app/(app)/app/recipes/actions", () => ({
  createRecipeAction: vi.fn(),
  updateRecipeAction: vi.fn(),
  createRecipeVersionAction: vi.fn(),
  createBrewBatchFromRecipeAction: vi.fn(),
  deleteRecipeAction: vi.fn(async () => ({ ok: true, message: "Рецепт удален." })),
  previewRecipeDraftAction: vi.fn(),
  createRecipeCustomIngredientAction: vi.fn(),
  exportRecipeBeerXmlAction: vi.fn(),
  importBeerXmlRecipeAction: vi.fn(),
  importBrewfatherJsonRecipeAction: vi.fn(),
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
  hiddenAt: null,
  hiddenReason: null,
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
  authorDisplayName: null,
  processMeta: defaultRecipeProcessMeta,
  calculationMeta: null,
  heroImageId: null,
  rating: null,
  ingredients: [],
  versions: [],
  completedBrewCount: 0,
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
  mashTunDeadspaceL: 0,
  minMashVolumeL: null,
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

// RecipeDesigner вызывает useToast на верхнем уровне (undo-тост удаления позиции),
// поэтому статический рендер обязан идти внутри ToastProvider из @nb/ui.
const renderDesignerMarkup = (props: React.ComponentProps<typeof RecipeDesigner>) =>
  renderToStaticMarkup(React.createElement(ToastProvider, null, React.createElement(RecipeDesigner, props)));

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

  it("treats import/export modal as dirty only with unfinished pasted/loaded text", () => {
    expect(isImportExportModalDirty({ importText: "", statusTone: null })).toBe(false);
    expect(isImportExportModalDirty({ importText: "   ", statusTone: null })).toBe(false);
    expect(isImportExportModalDirty({ importText: "<RECIPES></RECIPES>", statusTone: null })).toBe(true);
    expect(isImportExportModalDirty({ importText: "<RECIPES></RECIPES>", statusTone: "error" })).toBe(true);
    expect(isImportExportModalDirty({ importText: "<RECIPES></RECIPES>", statusTone: "pending" })).toBe(true);
    expect(isImportExportModalDirty({ importText: "<RECIPES></RECIPES>", statusTone: "success" })).toBe(false);
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
      label: "Несоложёное сырьё"
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
      label: "Специи и добавки",
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

    const autoHtml = renderDesignerMarkup({
      mode: "edit",
      initialRecipe: buildRecipeDetail({ waterPlanMeta: autoWaterPlanMeta }),
      preferredGravityUnit: "plato",
    });
    const manualHtml = renderDesignerMarkup({
      mode: "edit",
      initialRecipe: buildRecipeDetail({ waterPlanMeta: manualWaterPlanMeta }),
      preferredGravityUnit: "plato",
    });

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

  it("designer header renders aligned field labels", () => {
    const html = renderDesignerMarkup({ mode: "create", preferredGravityUnit: "plato" });

    expect(html).toContain("Название рецепта");
    expect(html).toContain("Стиль BJCP");
    expect(html).toContain("Оборудование");
    expect(html).toContain("Без профиля — ручной ввод параметров");
    expect(html).not.toContain("Профиль не выбран. Параметры задаются вручную.");
    expect(html).not.toContain("На основе профиля оборудования");
    expect(html).not.toContain("Значения сохраняются в рецепте");
    expect(html).toContain("Водоподготовка");
    expect(html).toContain("Специи и добавки");
    expect(html).toContain("Импорт / экспорт");
    expect(html).toContain("Сварить");
    expect(html).toContain("Затирание");
    expect(html).toContain("aria-label=\"Открыть настройки КП\"");
    // Новый рецепт стартует с одним дефолтным шагом затирания (66 °C / 60 мин).
    expect(html).toContain("(1)");
    expect(html).toContain('value="66"');
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

  // B1: списание склада — операция варочного дня. В редакторе от него не осталось ни
  // секции, ни кнопок; построчная плашка «Со склада» (намерение взять со склада) — живёт.
  it("в редакторе рецепта нет складских действий, но плашка «Со склада» в строке остаётся", () => {
    const html = renderDesignerMarkup({
      mode: "edit",
      initialRecipe: buildRecipeDetail({
        ingredients: [{
          id: "ri-hop",
          recipeId: "recipe-1",
          persistentKey: "00000000-0000-4000-8000-000000000101",
          displayOrder: 0,
          ingredientCatalogItemId: "hop-saaz",
          userCustomIngredientId: null,
          type: "hop",
          ingredientCategory: "hop",
          ingredientSubtype: null,
          ingredientDisplayName: "Заац",
          amountEnteredQuantity: 20,
          amountEnteredUnit: "g",
          amountNormalizedQuantity: 20,
          amountNormalizedUnit: "g",
          stage: "boil",
          timeOffset: 60,
          stepMeta: { useType: "boil", timeMinutes: 60 },
          inventoryIntentMode: "use_stock",
          inventorySelectionMeta: { inventoryItemId: "inv-1" },
          createdAt: new Date("2026-04-20T10:00:00Z"),
          updatedAt: new Date("2026-04-20T10:00:00Z"),
        }],
      }),
      preferredGravityUnit: "plato",
    });

    expect(html).not.toContain("Ингредиенты со склада");
    expect(html).not.toContain("Списать со склада");
    expect(html).not.toContain("Обновить наличие");
    expect(html).not.toContain("Нет готовых к списанию складских позиций");
    expect(html).toContain("Со склада");
  });

  // B2: удалить рецепт можно прямо из редактора (kebab → «Удалить рецепт» с подтверждением).
  // Содержимое DropdownMenu живёт в Radix-портале и в статическую разметку не попадает —
  // проверяем сам триггер: он появляется, только когда рецепт уже есть в БД.
  it("kebab «Действия с рецептом» есть у сохранённого рецепта и отсутствует у несохранённого", () => {
    const editHtml = renderDesignerMarkup({
      mode: "edit",
      initialRecipe: buildRecipeDetail(),
      preferredGravityUnit: "plato",
    });
    const createHtml = renderDesignerMarkup({ mode: "create", preferredGravityUnit: "plato" });

    expect(editHtml).toContain("Действия с рецептом");
    expect(createHtml).not.toContain("Действия с рецептом");
  });

  // B2 (после ревью Н4): порог создания записи в БД — содержание ИЛИ личность.
  // «Зашёл и ушёл» записи не оставляет, но и осмысленное начало работы (своё имя,
  // свой стиль, описание) больше не пропадает — рецепт сохраняется.
  it("порог создания рецепта: ингредиент, своё имя, свой стиль или описание", () => {
    const baseline = { title: "Новый рецепт 7", styleId: null };
    const emptyPayload = {
      title: "Новый рецепт 7",
      publicationState: "private" as const,
      batchSizeEnteredQuantity: 20,
      batchSizeEnteredUnit: "l",
      boilTimeMinutes: 60,
      ingredients: []
    };

    // Пустой рецепт с автоименем — мусор, в БД не заводим (даже без baseline:
    // «Новый рецепт N» распознаётся по формату).
    expect(isRecipeDraftWorthPersisting(emptyPayload, baseline)).toBe(false);
    expect(isRecipeDraftWorthPersisting(emptyPayload)).toBe(false);
    // Настройки процесса сами по себе рецептом не делают — порог не проходят.
    expect(isRecipeDraftWorthPersisting({
      ...emptyPayload,
      batchSizeEnteredQuantity: 33,
      boilTimeMinutes: 90
    }, baseline)).toBe(false);

    expect(isRecipeDraftWorthPersisting({
      ...emptyPayload,
      ingredients: [{
        amountEnteredQuantity: 5,
        amountEnteredUnit: "kg",
        stage: "mash" as const,
        ingredientCatalogItemId: "malt-pilsner"
      }]
    }, baseline)).toBe(true);
    expect(isRecipeDraftWorthPersisting({ ...emptyPayload, title: "Мой стаут" }, baseline)).toBe(true);
    expect(isRecipeDraftWorthPersisting({ ...emptyPayload, styleId: "20A" }, baseline)).toBe(true);
    expect(isRecipeDraftWorthPersisting({ ...emptyPayload, description: "Тёмный, на овсянке" }, baseline)).toBe(true);
    expect(isRecipeDraftWorthPersisting({ ...emptyPayload, authorNotes: "Дрожжи US-05" }, baseline)).toBe(true);

    // Стиль, предзаполненный из URL (/app/recipes/new?style=24A), выбирал не
    // редактор — сам по себе он черновик не заводит; смена стиля — заводит.
    const prefilled = { ...emptyPayload, styleId: "24A" };
    expect(isRecipeDraftWorthPersisting(prefilled, { ...baseline, styleId: "24A" })).toBe(false);
    expect(isRecipeDraftWorthPersisting({ ...prefilled, styleId: "21A" }, { ...baseline, styleId: "24A" })).toBe(true);
  });

  // Автоимя генерит getNextDefaultRecipeTitle (features/recipes/service.ts);
  // формат обязан совпадать, иначе порог примет автоимя за «своё название».
  it("автоимя «Новый рецепт N» не считается своим названием", () => {
    expect(isAutoRecipeTitle("Новый рецепт 1")).toBe(true);
    expect(isAutoRecipeTitle("Новый рецепт 42")).toBe(true);
    expect(isAutoRecipeTitle("  Новый рецепт 7  ")).toBe(true);
    expect(isAutoRecipeTitle("Новый рецепт")).toBe(true);
    expect(isAutoRecipeTitle("Новый рецепт стаута")).toBe(false);
    expect(isAutoRecipeTitle("Мой стаут")).toBe(false);
  });

  // Шапка обязана честно говорить, есть запись в БД или нет: «Черновик» читался бы
  // как «сохранён, но не опубликован» (это соседний чип «Приватный»).
  it("шапка несохранённого рецепта показывает «Не сохранён»", () => {
    const createHtml = renderDesignerMarkup({ mode: "create", preferredGravityUnit: "plato" });

    expect(createHtml).toContain("Не сохранён");
    expect(createHtml).not.toContain("Черновик");
    // Нетронутый конструктор терять нечего — кнопку «Сохранить» не навязываем
    // (она появляется, как только появляется несохранённая работа).
    expect(createHtml).not.toContain(">Сохранить<");

    const editHtml = renderDesignerMarkup({
      mode: "edit",
      initialRecipe: buildRecipeDetail(),
      preferredGravityUnit: "plato"
    });

    expect(editHtml).toContain("Сохранено");
    expect(editHtml).not.toContain("Не сохранён");
  });

  // Н5: партии переживают удаление рецепта, но теряют связь с ним — подтверждение
  // обязано назвать их число и судьбу, а не молчать.
  it("подтверждение удаления рецепта называет судьбу партий", () => {
    expect(buildRecipeDeleteConfirmDescription("Мой стаут", 0))
      .toBe("Рецепт «Мой стаут» будет удалён вместе с ингредиентами и параметрами.");
    expect(buildRecipeDeleteConfirmDescription("Мой стаут", 1))
      .toBe("Рецепт «Мой стаут» будет удалён вместе с ингредиентами и параметрами. У рецепта 1 партия. Она останется в «Партиях», но потеряет связь с рецептом.");
    expect(buildRecipeDeleteConfirmDescription("Мой стаут", 3))
      .toBe("Рецепт «Мой стаут» будет удалён вместе с ингредиентами и параметрами. У рецепта 3 партии. Они останутся в «Партиях», но потеряют связь с рецептом.");
    expect(buildRecipeDeleteConfirmDescription("Мой стаут", 5)).toContain("У рецепта 5 партий.");
    expect(buildRecipeDeleteConfirmDescription("   ", 0)).toContain("«Без названия»");
  });

  // A5: пустое «мин» у хмеля на кипячение молча превращалось в 60 при расчёте IBU и
  // ни во что — на странице рецепта. Теперь поле предзаполнено временем кипячения.
  it("поле «мин» у хмеля на кипячение предзаполнено временем кипячения рецепта", () => {
    expect(createEmptyIngredient("hop", "boil").stepMeta.timeMinutes).toBe("60");
    expect(createEmptyIngredient("hop", "boil", null, 90).stepMeta.timeMinutes).toBe("90");
    expect(createEmptyIngredient("hop", "boil", null, 90).timeOffset).toBe("90");
    // Время хопстенда ≠ время кипячения, у FWH время вообще не участвует в расчёте —
    // осмысленного дефолта нет, поле остаётся пустым.
    expect(createEmptyIngredient("hop", "whirlpool", null, 90).stepMeta.timeMinutes).toBe("");
    expect(createEmptyIngredient("hop", "first_wort_hop", null, 90).stepMeta.timeMinutes).toBe("");
    expect(createEmptyIngredient("hop", "dry_hop", null, 90).stepMeta.timeMinutes).toBeUndefined();
  });

  // Н6: дефолт «мин» подставлялся только при СОЗДАНИИ строки. Хмель, добавленный
  // как сухое охмеление и переключённый на кипячение, оставался с пустым временем —
  // и расчёт IBU молча подставлял своё.
  it("смена типа добавления на «Кипячение» подставляет время кипячения рецепта", () => {
    const dryHop = createEmptyIngredient("hop", "dry_hop", null, 90);
    const switchedToBoil = applyHopUseTypeChange(dryHop, "boil", 90);

    expect(switchedToBoil.stepMeta.useType).toBe("boil");
    expect(switchedToBoil.stepMeta.timeMinutes).toBe("90");
    expect(switchedToBoil.timeOffset).toBe("90");
    expect(switchedToBoil.stage).toBe("boil");

    // Введённое пользователем время не перетираем.
    const boilWithTime = applyHopUseTypeChange({
      ...dryHop,
      stepMeta: { ...dryHop.stepMeta, timeMinutes: "15" }
    }, "boil", 90);
    expect(boilWithTime.stepMeta.timeMinutes).toBe("15");

    // Для типов без осмысленного дефолта время не выдумываем (хопстенд ≠ кипячение).
    const whirlpool = applyHopUseTypeChange(dryHop, "whirlpool", 90);
    expect(whirlpool.stepMeta.timeMinutes).toBeUndefined();
    expect(whirlpool.stage).toBe("whirlpool");

    // Дефолт берётся из времени кипячения рецепта, а не из константы.
    expect(applyHopUseTypeChange(dryHop, "boil", 45).stepMeta.timeMinutes).toBe("45");
    expect(applyHopUseTypeChange(dryHop, "boil").stepMeta.timeMinutes).toBe("60");
  });

  it("renders manually added water treatments with the water-additive card style", () => {
    const html = renderDesignerMarkup({
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
    });

    expect(html).toContain("Гипс");
    expect(html).toContain("CaSO4");
    expect(html).toContain("Из каталога");
    expect(html).toContain("border-l-sky-400");
    expect(html).not.toContain("hover:shadow-md");
  });

  it("marks selected BJCP styles without fixed ranges in the recipe stat tracks", () => {
    const html = renderDesignerMarkup({
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
    });

    expect(html).toContain("Специальное пиво по коммерческому образцу");
    expect(html).toContain("Диапазоны BJCP не указаны");
    expect(html).toContain("Диапазон не указан в BJCP");
  });

  it("shows the FG range next to the point estimate in the sticky metrics header (#16/17)", () => {
    const html = renderDesignerMarkup({
      mode: "edit",
      initialRecipe: buildRecipeDetail({
        fg: 1.012,
        fgEstimateMode: "yeast_estimate",
        fgEstimateDetails: {
          baseAttenuationPct: 75,
          attenuationSource: "yeast",
          mainMashTempC: 66,
          mashAdjPctPoints: 0.5,
          simpleSugarSharePct: 0,
          crystalDextrinSharePct: 0,
          lactoseSharePct: 0,
          simpleSugarAdj: 0,
          crystalDextrinAdj: 0,
          lactoseAdj: 0,
          effectiveAttenuationPct: 75.5,
          fgRangeMin: 1.009,
          fgRangeMax: 1.014
        }
      }),
      preferredGravityUnit: "plato"
    });

    // Диапазон форматируется той же formatGravityRange, что и в шапке — не хардкодим число.
    const expectedRange = formatGravityRange(1.009, 1.014, "plato");
    expect(expectedRange).not.toBeNull();
    expect(html).toContain(`(${expectedRange})`);
  });

  it("shows the secondary gravity unit next to OG/FG in stat cells and the sticky header", () => {
    const html = renderDesignerMarkup({
      mode: "edit",
      initialRecipe: buildRecipeDetail({
        og: 1.052,
        fg: 1.012
      }),
      preferredGravityUnit: "plato"
    });

    // Вторая единица считается той же formatGravitySecondary, что и продакшен-код —
    // не хардкодим конвертированное число.
    const expectedOgSecondary = formatGravitySecondary(1.052, "plato");
    const expectedFgSecondary = formatGravitySecondary(1.012, "plato");
    expect(expectedOgSecondary).not.toBeNull();
    expect(expectedFgSecondary).not.toBeNull();
    // Появляется дважды: в ячейке «Параметры партии» и в закреплённой шапке.
    expect(html.split(expectedOgSecondary!).length - 1).toBeGreaterThanOrEqual(2);
    expect(html.split(expectedFgSecondary!).length - 1).toBeGreaterThanOrEqual(2);
  });

  it("uses the default equipment profile as the initial profile for a new recipe", () => {
    const html = renderDesignerMarkup({
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
    });

    expect(html).toContain("Клон Braumeister · Основной — 27 л · 72%");
    expect(html).toContain("HERMS");
    expect(html).not.toContain("Основано на профиле Клон Braumeister");
    expect(html).toContain('value="27"');
    expect(html).toContain('value="72"');
  });

  it("opens the empty boil hop additions group by default", () => {
    const html = renderDesignerMarkup({ mode: "create", preferredGravityUnit: "plato" });

    expect(html).toContain("Добавление на кипячение");
    expect(html).toContain("Добавьте хмель на кипячение");
    expect(html).toContain("Другие типы охмеления");
    expect(html.indexOf("Сухое охмеление")).toBeLessThan(html.indexOf("Вирпул / хопстенд"));
    expect(html.indexOf("Вирпул / хопстенд")).toBeLessThan(html.indexOf("Дип-хоп"));
    expect(html.indexOf("Дип-хоп")).toBeLessThan(html.indexOf("Первое сусло (FWH)"));
    expect(html.indexOf("Первое сусло (FWH)")).toBeLessThan(html.indexOf("Другое"));
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
    const html = renderDesignerMarkup({
      mode: "edit",
      initialRecipe: buildRecipeDetail({
        styleId: "1A"
      }),
      preferredGravityUnit: "plato"
    });

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
      description: "",
      boilTimeMinutes: 60,
      ingredientCategories: ["fermentable", "hop"]
    });

    expect(checklist.find((item) => item.key === "title")?.isSatisfied).toBe(true);
    // Стиль BJCP при публикации опционален — в чек-листе пункта styleId быть не должно.
    expect(checklist.some((item) => (item.key as string) === "styleId")).toBe(false);
    expect(checklist.find((item) => item.key === "description")).toMatchObject({
      isSatisfied: false,
      statusLabel: "Не заполнено"
    });
    expect(checklist.find((item) => item.key === "ingredients.yeast")).toMatchObject({
      isSatisfied: false,
      statusLabel: "Не добавлено"
    });
  });

  it("shows the rescale-to-volume action only when the scale base and current volume actually diverge (#6)", () => {
    expect(shouldShowRescaleToVolumeAction({
      scaleBaseVolumeL: 20,
      currentBatchVolumeL: 30,
      ingredientCount: 3
    })).toBe(true);

    // No scale base yet (volume field never resolved) — nothing to diff against.
    expect(shouldShowRescaleToVolumeAction({
      scaleBaseVolumeL: null,
      currentBatchVolumeL: 30,
      ingredientCount: 3
    })).toBe(false);

    // Volume still matches the base the amounts were entered for — nothing to rescale.
    expect(shouldShowRescaleToVolumeAction({
      scaleBaseVolumeL: 20,
      currentBatchVolumeL: 20,
      ingredientCount: 3
    })).toBe(false);

    // Tiny float noise from unit conversion shouldn't flip the action on.
    expect(shouldShowRescaleToVolumeAction({
      scaleBaseVolumeL: 20,
      currentBatchVolumeL: 20.0001,
      ingredientCount: 3
    })).toBe(false);

    // No ingredients yet — nothing to scale, by default quantities stay untouched.
    expect(shouldShowRescaleToVolumeAction({
      scaleBaseVolumeL: 20,
      currentBatchVolumeL: 30,
      ingredientCount: 0
    })).toBe(false);

    // Volume field currently empty/invalid — nothing to compare against.
    expect(shouldShowRescaleToVolumeAction({
      scaleBaseVolumeL: 20,
      currentBatchVolumeL: null,
      ingredientCount: 3
    })).toBe(false);
  });

  it("create and edit pages are importable", () => {
    expect(typeof NewRecipePage).toBe("function");
    expect(typeof EditRecipePage).toBe("function");
  });
});
