import { convertVolume, convertWeight, evaluateStyleFit, getStyleRangeById, type BrewingSaltId } from "@nb/brewing-core";
import { Droplets, FlaskConical, Hop, Package, Wheat } from "lucide-react";
import type React from "react";

import {
  type RecipeEditorPayload,
  type RecipeEditorResult
} from "@/app/(app)/app/recipes/actions";
import { buildIngredientSearchParams } from "@/components/ingredients/ingredient-picker";
import { type RecipeIngredientCardSource } from "@/components/recipes/recipe-ingredient-card-display";
import { resolveInventoryIngredientContextCategoryLabel } from "@/components/inventory/inventory-ingredient-context-summary";
import {
  DEFAULT_BREWHOUSE_EFFICIENCY_PCT,
  type EquipmentProfileSnapshot
} from "@/features/equipment-profiles/contracts";
import type {
  IngredientCategory,
  IngredientConsumableGroupRefinement,
  IngredientSearchResult,
  IngredientSuggestionItem,
  IngredientSubtype,
  IngredientTechnicalData,
  IngredientType
} from "@/features/ingredients/contracts";
import {
  canonicalizeFermentableQuickStartGroup,
  resolveFermentableQuickStartGroupLabel
} from "@/features/ingredients/picker-quick-start";
import {
  consumableInventoryAdditiveGroups,
  resolveConsumableInventoryBroadGroupLabel
} from "@/features/ingredients/consumables";
import { resolveIngredientDisplayNames } from "@/features/ingredients/presentation";
import { resolveIngredientCategory, resolveLegacyIngredientType } from "@/features/ingredients/taxonomy";
import { fermentableUseLabels, hopUseTypeLabels } from "@/features/recipes/ingredient-labels";
import {
  formatInventoryQuantityInputValue,
  resolveInventoryMeasurementForDisplay
} from "@/features/inventory/display";
import {
  inventoryUnitLabels,
  resolveHumanFacingInventoryUnitProfile,
  type InventoryUnit,
  type InventoryUnitDimension
} from "@/features/inventory/units";
import {
  createRecipePayloadSchema,
  defaultRecipeProcessMeta,
  type RecipeIngredientStage,
  type RecipeCalculationMeta,
  type RecipeDetailDto,
  type RecipeDraftPreviewDto,
  type RecipeHopUseType,
  type RecipeImportedIngredientSnapshot,
  type RecipeInventoryIntentMode,
  type RecipeInventorySelectionMeta,
  type RecipeProcessMeta,
  type RecipePublicationState,
  type RecipeWaterManualSaltAdditionTarget,
  type RecipeWaterPlanMeta
} from "@/features/recipes/contracts";
import { getRecipePublicationFieldErrors } from "@/features/recipes/publication-validation";
import {
  type RecipeWaterPlanFermentableInput,
  type RecipeWaterPlanResult
} from "@/features/recipes/water-plan";
import {
  recipeWaterAddFlowCatalogIds,
  recipeWaterManualSaltIds,
  resolveRecipeWaterSaltIdFromCatalogId
} from "@/features/recipes/water-additives-catalog";
import { validateNumericInput } from "@/features/forms/numeric-validation";

// Чистые функции/константы recipe-designer: типы, клоны/нормализация мета,
// сборка payload, водоподготовка add-flow и поиск ингредиентов по складу.
// Вынесено механически из recipe-designer.tsx (этап 6a) — логика не менялась.

export const buildRecipeEditHref = (recipeId: string) => `/app/recipes/${recipeId}/edit`;

export const buildRecipeWizardResumeHref = (recipeId: string) => `/app/recipes/new?recipeId=${encodeURIComponent(recipeId)}`;

export const buildRecipeEditorResumeHref = (recipeId: string, currentPath: string) => (
  currentPath === "/app/recipes/new"
    ? buildRecipeWizardResumeHref(recipeId)
    : buildRecipeEditHref(recipeId)
);

export const replaceRecipeEditorUrl = (recipeId: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const nextHref = buildRecipeEditorResumeHref(recipeId, window.location.pathname);
  const currentHref = `${window.location.pathname}${window.location.search}`;
  if (currentHref === nextHref) {
    return;
  }

  // `null` lets Next.js copy its internal router state and update the URL
  // without triggering a route navigation or a full page reload.
  window.history.replaceState(null, "", nextHref);
};

export const resolveRecipeIngredientSearchType = ({
  category,
  type
}: {
  category?: IngredientCategory | null;
  type?: IngredientType | null;
}): IngredientType | undefined => (
  category === "fermentable" ? undefined : type ?? undefined
);

export type RecipeIngredientEditorSourceMode = "use_stock" | "catalog" | "custom";

export const resolveRecipeIngredientEditorSourceMode = (
  mode?: RecipeInventoryIntentMode | null
): RecipeIngredientEditorSourceMode => {
  if (mode === "use_stock") {
    return "use_stock";
  }

  if (mode === "custom") {
    return "custom";
  }

  return "catalog";
};
export type RecipeFermentablePickerScope =
  | "malt"
  | "adjunct_grains"
  | "extracts_and_concentrates"
  | "sugars_and_syrups"
  | "fruits_and_vegetables";

export const isRecipeFermentableGroupScope = (
  value: string
): value is Exclude<RecipeFermentablePickerScope, "malt"> => (
  value === "adjunct_grains"
  || value === "extracts_and_concentrates"
  || value === "sugars_and_syrups"
  || value === "fruits_and_vegetables"
);

export const resolveRecipeFermentablePickerScopeContext = (
  scope?: RecipeFermentablePickerScope | null
): {
  subtype: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  group: string | null;
  label: string | null;
} => {
  if (!scope) {
    return {
      subtype: null,
      group: null,
      label: null
    };
  }

  if (scope === "malt") {
    return {
      subtype: "malt",
      group: null,
      label: "Солод"
    };
  }

  const label = resolveFermentableQuickStartGroupLabel(scope) ?? null;
  return {
    subtype: "fermentable",
    group: scope,
    label
  };
};

export const buildRecipeFermentableForcedGroup = (
  scope?: RecipeFermentablePickerScope | null
): IngredientConsumableGroupRefinement | null => {
  const context = resolveRecipeFermentablePickerScopeContext(scope);
  if (!context.group || !context.label) {
    return null;
  }

  return {
    type: "consumable_group",
    label: context.label,
    normalizedLabel: context.group,
    value: context.group,
    count: 0,
    score: 0
  };
};

export const recipeConsumableAdditiveGroup = "inventory_additives";
export const recipeConsumableSubtypeOptions = consumableInventoryAdditiveGroups as readonly IngredientSubtype[];

export const buildRecipeConsumableForcedGroup = (): IngredientConsumableGroupRefinement => ({
  type: "consumable_group",
  label: resolveConsumableInventoryBroadGroupLabel(recipeConsumableAdditiveGroup) ?? "Специи и добавки",
  normalizedLabel: recipeConsumableAdditiveGroup,
  value: recipeConsumableAdditiveGroup,
  count: 0,
  score: 0
});

export const resolveRecipeIngredientForcedGroup = ({
  category,
  fermentableGroup
}: {
  category: IngredientCategory;
  fermentableGroup?: IngredientConsumableGroupRefinement | null;
}): IngredientConsumableGroupRefinement | null => {
  if (category === "consumable") {
    return buildRecipeConsumableForcedGroup();
  }

  return fermentableGroup ?? null;
};

export const resolveRecipeIngredientEditorCategoryLabel = ({
  category
}: {
  category?: IngredientCategory | null;
}) => {
  if (category === "fermentable") {
    return "Сбраживаемое";
  }

  return resolveInventoryIngredientContextCategoryLabel({ category });
};

export const resolveRecipeFermentablePickerScopeFromIngredient = (
  ingredient: DesignerIngredient
): RecipeFermentablePickerScope | null => {
  if (ingredient.category !== "fermentable") {
    return null;
  }

  return ingredient.subtype === "malt" ? "malt" : null;
};
export const shouldAutoFocusRecipeIngredientPicker = ({
  ingredient,
  hasSelectedPreview,
  sourceMode
}: {
  ingredient: DesignerIngredient;
  hasSelectedPreview: boolean;
  sourceMode: RecipeIngredientEditorSourceMode;
}) => (
  !hasSelectedPreview
  && sourceMode === "catalog"
  && !ingredient.ingredientCatalogItemId
  && !ingredient.userCustomIngredientId
  && readImportedDesignerIngredientSnapshot(ingredient) != null
);

export type DesignerIngredient = {
  localId: string;
  persistentKey: string;
  ingredientCatalogItemId: string | null;
  userCustomIngredientId: string | null;
  selectedName: string;
  selectedSecondaryName: string;
  selectedSummary: string;
  familyDisplayName: string;
  brand: string | null;
  producer: string | null;
  brandName: string | null;
  manufacturer: string | null;
  countryCode: string | null;
  countryName: string | null;
  country: string | null;
  category: IngredientCategory;
  subtype: IngredientSubtype | null;
  familyId: string | null;
  type: IngredientType;
  technicalData: IngredientTechnicalData | null;
  defaultDisplayUnit: InventoryUnit;
  allowedUnits: InventoryUnit[];
  measurementDimension: InventoryUnitDimension | null;
  amountEnteredQuantity: string;
  amountEnteredUnit: InventoryUnit;
  stage: "mash" | "boil" | "whirlpool" | "fermentation" | "packaging" | "other";
  timeOffset: string;
  stepMeta: {
    use?: string | null;
    useType?: RecipeHopUseType | null;
    timeMinutes?: string;
    temperatureC?: string;
    durationDays?: string;
    fermentationTempC?: string;
    stageLabel?: string;
  };
  inventoryIntentMode: RecipeInventoryIntentMode;
  inventorySelectionMeta: RecipeInventorySelectionMeta | null;
  externalImportMeta: Record<string, unknown> | null;
};

export type OpenEditorState = {
  localId: string | null;
  category: IngredientCategory;
  draft: DesignerIngredient;
  initialSignature: string;
  isExisting: boolean;
};

export const hopUseTypeSectionLabels: Record<RecipeHopUseType, string> = {
  ...hopUseTypeLabels,
  boil: "Добавление на кипячение"
};

export const recipeHopUseTypeUiOrder: RecipeHopUseType[] = [
  "boil",
  "dry_hop",
  "whirlpool",
  "dip_hop",
  "first_wort_hop",
  "other"
];

export const recipeAdditionalHopUseTypeUiOrder = recipeHopUseTypeUiOrder.filter((useType) => useType !== "boil");

export const stageLabels: Record<DesignerIngredient["stage"], string> = {
  mash: "Затор",
  boil: "Кипячение",
  whirlpool: "Вирпул",
  fermentation: "Брожение",
  packaging: "Розлив",
  other: "Другое"
};

export const recipeConsumableStageFallbackOrder: RecipeIngredientStage[] = [
  "mash",
  "boil",
  "whirlpool",
  "fermentation",
  "packaging",
  "other"
];

export const normalizeRecipeConsumableUsageStageKey = (value?: string | null) => (
  value?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? ""
);

export const mapRecipeConsumableUsageStage = (value?: string | null): RecipeIngredientStage | null => {
  const normalized = normalizeRecipeConsumableUsageStageKey(value);
  if (!normalized) {
    return null;
  }

  if (normalized === "mash" || normalized.includes("затор")) return "mash";
  if (normalized === "boil" || normalized.includes("кип")) return "boil";
  if (
    normalized === "flameout"
    || normalized === "whirlpool"
    || normalized.includes("вирпул")
    || normalized.includes("выключ")
  ) return "whirlpool";
  if (
    normalized === "primary"
    || normalized === "secondary"
    || normalized === "fermentation"
    || normalized === "cold_crash"
    || normalized === "conditioning"
    || normalized === "post_fermentation"
    || normalized.includes("брож")
  ) return "fermentation";
  if (
    normalized === "bottling"
    || normalized === "packaging"
    || normalized === "finished_beer"
    || normalized.includes("розлив")
    || normalized.includes("упаков")
  ) return "packaging";

  return "other";
};

export const resolveRecipeConsumableStageOptions = (
  technicalData?: IngredientTechnicalData | null
): RecipeIngredientStage[] => {
  if (!technicalData || technicalData.type !== "consumable") {
    return recipeConsumableStageFallbackOrder;
  }

  const stages = new Set<RecipeIngredientStage>();
  const usageStages = Array.isArray(technicalData.usageStage)
    ? technicalData.usageStage
    : [];

  for (const usageStage of usageStages) {
    const mapped = mapRecipeConsumableUsageStage(usageStage);
    if (mapped) {
      stages.add(mapped);
    }
  }

  if (!stages.size) {
    return recipeConsumableStageFallbackOrder;
  }

  const orderedStages = recipeConsumableStageFallbackOrder.filter((stage) => stages.has(stage));
  return orderedStages.includes("other") ? orderedStages : [...orderedStages, "other"];
};

export const resolveRecipeConsumableDefaultStage = (
  technicalData?: IngredientTechnicalData | null
): RecipeIngredientStage => {
  if (!technicalData || technicalData.type !== "consumable") {
    return "other";
  }

  const usageStages = Array.isArray(technicalData.usageStage)
    ? technicalData.usageStage
    : [];

  for (const usageStage of usageStages) {
    const mapped = mapRecipeConsumableUsageStage(usageStage);
    if (mapped) {
      return mapped;
    }
  }

  return "other";
};

export { fermentableUseLabels, hopUseTypeLabels } from "@/features/recipes/ingredient-labels";

export const createLocalId = () => (
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) => (
      (Number(char) ^ Math.random() * 16 >> Number(char) / 4).toString(16)
    ))
);

export const DEFAULT_BATCH_SIZE_ENTERED_QUANTITY = 20;
export const DEFAULT_BATCH_SIZE_ENTERED_UNIT: InventoryUnit = "l";
export const DEFAULT_BOIL_TIME_MINUTES = 60;
export const DEFAULT_EFFICIENCY = DEFAULT_BREWHOUSE_EFFICIENCY_PCT;

export const cloneRecipeProcessMeta = (value: RecipeProcessMeta = defaultRecipeProcessMeta): RecipeProcessMeta => ({
  mashProfile: {
    steps: value.mashProfile.steps.map((step) => ({
      id: step.id,
      name: step.name,
      temperatureC: step.temperatureC,
      durationMinutes: step.durationMinutes
    }))
  },
  fermentationProfile: {
    primaryTemperatureC: value.fermentationProfile.primaryTemperatureC ?? null,
    primaryDurationDays: value.fermentationProfile.primaryDurationDays ?? null,
    extraSteps: value.fermentationProfile.extraSteps.map((step) => ({
      id: step.id,
      name: step.name,
      temperatureC: step.temperatureC ?? null,
      durationDays: step.durationDays ?? null
    })),
    coldCrash: {
      enabled: value.fermentationProfile.coldCrash.enabled,
      temperatureC: value.fermentationProfile.coldCrash.temperatureC ?? null,
      durationDays: value.fermentationProfile.coldCrash.durationDays ?? null
    },
    conditioning: {
      enabled: value.fermentationProfile.conditioning.enabled,
      temperatureC: value.fermentationProfile.conditioning.temperatureC ?? null,
      durationDays: value.fermentationProfile.conditioning.durationDays ?? null
    }
  }
});

export const cloneRecipeCalculationMeta = (value?: RecipeCalculationMeta | null): RecipeCalculationMeta => ({
  bitternessFormula: value?.bitternessFormula ?? "tinseth_whirlpool_v2",
  bitternessSettings: {
    ...(value?.bitternessSettings ?? {})
  },
  fgEstimateMode: value?.fgEstimateMode ?? null,
  manualAttenuationOverridePct: value?.manualAttenuationOverridePct ?? null,
  manualFgOverrideValue: value?.manualFgOverrideValue ?? null,
  fgEstimateDetails: value?.fgEstimateDetails ? {
    ...value.fgEstimateDetails
  } : null
});

export const cloneRecipeWaterPlanMeta = (value?: RecipeWaterPlanMeta | null): RecipeWaterPlanMeta => ({
  setupEnabled: value?.setupEnabled ?? false,
  engine: value?.engine ?? "balanced_default",
  phModel: value?.phModel ?? "hybrid_mash_ph_v1",
  sourceProfileMode: value?.sourceProfileMode ?? "preset",
  sourceProfilePresetId: value?.sourceProfilePresetId ?? "ro_distilled",
  sourceProfileSavedId: value?.sourceProfileSavedId ?? null,
  sourceProfileName: value?.sourceProfileName ?? null,
  sourceProfile: value?.sourceProfile ?? null,
  targetProfileMode: value?.targetProfileMode ?? "catalog",
  targetProfilePresetId: value?.targetProfilePresetId ?? null,
  targetProfileSlug: value?.targetProfileSlug ?? null,
  targetProfileSavedId: value?.targetProfileSavedId ?? null,
  targetProfileName: value?.targetProfileName ?? null,
  targetProfileSource: value?.targetProfileSource ?? null,
  targetProfileIsOverridden: value?.targetProfileIsOverridden ?? false,
  targetProfileResolvedFromBjcpStyleKey:
    value?.targetProfileResolvedFromBjcpStyleKey ?? null,
  targetProfile: value?.targetProfile ?? null,
  showWaterAdditivesInIngredients: value?.showWaterAdditivesInIngredients ?? false,
  blendRatio: value?.blendRatio ?? null,
  mashWaterVolumeL: value?.mashWaterVolumeL ?? null,
  spargeWaterVolumeL: value?.spargeWaterVolumeL ?? null,
  totalWaterVolumeL: value?.totalWaterVolumeL ?? null,
  grainAbsorptionLPerKg: value?.grainAbsorptionLPerKg ?? null,
  allowedSalts: value?.allowedSalts ?? [],
  allowedAcids: value?.allowedAcids ?? [],
  manualSaltAdditions: value?.manualSaltAdditions ?? [],
  targetMashPh: value?.targetMashPh ?? null,
  spargeAcidificationEnabled: value?.spargeAcidificationEnabled ?? false,
  spargeSourcePh: value?.spargeSourcePh ?? null,
  targetSpargePh: value?.targetSpargePh ?? null,
  targetSpargeAlkalinity: value?.targetSpargeAlkalinity ?? null,
  selectedAcid: value?.selectedAcid ?? "lactic_acid",
  acidConcentrationPct: value?.acidConcentrationPct ?? null,
  calibrationOffset: value?.calibrationOffset ?? null
});

export const cloneEquipmentProfileSnapshot = (value?: EquipmentProfileSnapshot | null): EquipmentProfileSnapshot | null => (
  value ? {
    ...value,
    maxMashVolumeL: value.maxMashVolumeL ?? null,
    maxKettleVolumeL: value.maxKettleVolumeL ?? null,
    notes: value.notes ?? null
  } : null
);

// Слепок профиля строит features/equipment-profiles/snapshot.ts — тот же билдер
// нужен серверу при старте варки «на моём оборудовании» (features/brew-batches).
export { buildEquipmentProfileSnapshotFromDto } from "@/features/equipment-profiles/snapshot";

export const formatEquipmentProfileRecipeValue = (value: number) => {
  const rounded = Number(value.toFixed(2));
  return Number.isInteger(rounded) ? String(Math.trunc(rounded)) : String(rounded);
};

export const formatEquipmentProfilePercentValue = (value: number) => `${formatEquipmentProfileRecipeValue(value)}%`;
export const formatEquipmentProfileLitersValue = (value: number) => `${formatEquipmentProfileRecipeValue(value)} л`;

export const toInputString = (value: number | null | undefined) => (
  value == null ? "" : String(value)
);

export const toOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
};

export const normalizeSavePayload = (payload: RecipeEditorPayload): RecipeEditorPayload => ({
  ...payload,
  batchSizeEnteredUnit: payload.batchSizeEnteredUnit || DEFAULT_BATCH_SIZE_ENTERED_UNIT
});

export const mapFieldErrorsFromIssues = (
  payload: RecipeEditorPayload,
  issues: Array<{ path: Array<string | number>; message: string }>
) => {
  const fieldErrors: Record<string, string> = {};

  for (const issue of issues) {
    const [root, nested] = issue.path;
    let key = issue.path.join(".") || "form";
    let message = issue.message;

    if (key === "title") {
      message = "Укажите название рецепта.";
    }

    if (key === "batchSizeEnteredQuantity") {
      message = "Объём партии должен быть больше нуля.";
    } else if (key === "efficiency") {
      message = "Эффективность должна быть больше 0% и не больше 100%.";
    } else if (key === "boilTimeMinutes") {
      message = "Время кипячения должно быть от 1 до 600 минут.";
    } else if (key.startsWith("waterPlanMeta.")) {
      key = "waterPlanMeta";
    } else if (key.startsWith("processMeta.mashProfile.steps")) {
      key = "processMeta.mashProfile.steps";
    } else if (key.startsWith("processMeta.fermentationProfile")) {
      key = "processMeta.fermentationProfile";
    }

    if (root === "ingredients" && typeof nested === "number") {
      const ingredient = payload.ingredients[nested];
      key = ingredient?.category ? `ingredients.${ingredient.category}` : "ingredients";

      if (issue.path.includes("ingredientCatalogItemId")) {
        message = "Выберите ингредиент.";
      } else if (issue.path.includes("amountEnteredQuantity")) {
        message = "Укажите количество больше нуля.";
      }
    }

    if (!fieldErrors[key]) {
      fieldErrors[key] = message;
    }
  }

  return fieldErrors;
};

/**
 * Автоимя нового рецепта — «Новый рецепт N» (getNextDefaultRecipeTitle,
 * features/recipes/service.ts). Его выдал редактор, а не выбрал пользователь,
 * поэтому признаком осмысленной работы оно не считается. Кросс-проверка с
 * генератором — в tests/recipe-service.test.ts, чтобы формат не разъехался.
 */
const AUTO_RECIPE_TITLE_PATTERN = /^Новый рецепт(\s+\d+)?$/;

export const isAutoRecipeTitle = (title: string): boolean => AUTO_RECIPE_TITLE_PATTERN.test(title.trim());

/** Чем редактор засеян при открытии: автоимя и стиль из URL (`/app/recipes/new?style=24A`). */
export type RecipeDraftBaseline = {
  title?: string | null;
  styleId?: string | null;
};

/**
 * Порог, с которого черновик рецепта заводится в БД: у него появилось СОДЕРЖАНИЕ
 * (хотя бы один ингредиент) или ЛИЧНОСТЬ — своё название вместо автоматического
 * «Новый рецепт N», свой стиль, описание, заметки автора. Раньше запись рождалась
 * по первому же изменению любого поля, и на аккаунте копились пустые «Новый
 * рецепт N» без ABV/IBU/OG.
 *
 * Настройки процесса (объём, эффективность, кипячение, затирание, вода) порог не
 * проходят: рецепт без имени и без ингредиентов — это и есть тот мусор. Чтобы такая
 * работа не пропадала молча, шапка в этом состоянии честно пишет «Не сохранён» и
 * даёт кнопку «Сохранить» (persistRecipe force), а уход со страницы держит
 * beforeunload (см. use-recipe-autosave).
 *
 * Действует только на СОЗДАНИЕ: уже сохранённый рецепт продолжает автосейвиться,
 * даже если из него убрали всё.
 */
export const isRecipeDraftWorthPersisting = (
  payload: RecipeEditorPayload,
  baseline: RecipeDraftBaseline = {}
): boolean => {
  if (payload.ingredients.length > 0) {
    return true;
  }

  const title = payload.title.trim();
  if (title && title !== (baseline.title ?? "").trim() && !isAutoRecipeTitle(title)) {
    return true;
  }

  // Стиль, предзаполненный из URL, выбирал не редактор рецепта — сам по себе он
  // черновик не заводит; засчитываем только смену стиля пользователем.
  const styleId = (payload.styleId ?? "").trim();
  if (styleId && styleId !== (baseline.styleId ?? "").trim()) {
    return true;
  }

  return Boolean(payload.description?.trim() || payload.authorNotes?.trim());
};

/**
 * Текст подтверждения удаления рецепта. Реализация — в `features/recipes/format`:
 * тот же диалог показывает карточка галереи «Мои рецепты», а тянуть ради строки
 * весь этот модуль (пикер ингредиентов, brewing-core) в её бандл незачем.
 * Реэкспорт — чтобы дизайнер и его тесты не меняли путь импорта.
 */
export { buildRecipeDeleteConfirmDescription } from "@/features/recipes/format";

export const buildAutosaveBlockedResult = (
  payload: RecipeEditorPayload
): RecipeEditorResult | null => {
  const parsedPayload = createRecipePayloadSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return {
      ok: false,
      message: "Проверьте заполнение формы рецепта.",
      fieldErrors: mapFieldErrorsFromIssues(payload, parsedPayload.error.issues)
    };
  }

  const fieldErrors = getRecipePublicationFieldErrors({
    publicationState: payload.publicationState,
    title: payload.title,
    description: payload.description ?? null,
    boilTimeMinutes: payload.boilTimeMinutes,
    ingredientCategories: payload.ingredients.map((ingredient) => ingredient.category ?? null)
  });

  if (Object.keys(fieldErrors).length) {
    return {
      ok: false,
      message: "Проверьте заполнение рецепта.",
      fieldErrors
    };
  }

  return null;
};

export const normalizeEditorPublicationState = (state: RecipePublicationState | null | undefined): RecipePublicationState => (
  state === "published" ? "published" : "private"
);

export const mapHopStageFromUseType = (useType: RecipeHopUseType): DesignerIngredient["stage"] => {
  if (useType === "boil" || useType === "first_wort_hop") return "boil";
  if (useType === "whirlpool") return "whirlpool";
  if (useType === "dry_hop") return "fermentation";
  return "other";
};

export const resolveRecipeFermentableSubtype = (
  category: IngredientCategory,
  subtype?: IngredientSubtype | null
): Extract<IngredientSubtype, "malt" | "fermentable"> | null => (
  category === "fermentable" && (subtype === "malt" || subtype === "fermentable")
    ? subtype
    : null
);

export const createEmptyIngredient = (
  category: IngredientCategory,
  hopUseType: RecipeHopUseType = "boil",
  subtype: Extract<IngredientSubtype, "malt" | "fermentable"> | null = null,
  // Хмель на кипячение по умолчанию вносится на полное кипячение — это ровно то
  // число, которое иначе молча подставил бы расчёт IBU. Видимый дефолт вместо
  // пустого поля; пользователь его правит. Для FWH/вирпула/dip осмысленного
  // дефолта нет (время хопстенда ≠ время кипячения) — поле остаётся пустым.
  boilTimeMinutes: number = DEFAULT_BOIL_TIME_MINUTES
): DesignerIngredient => {
  const fermentableSubtype = resolveRecipeFermentableSubtype(category, subtype);
  const unitProfile = resolveHumanFacingInventoryUnitProfile({
    category,
    subtype: fermentableSubtype
  });

  if (category === "hop") {
    return {
      localId: createLocalId(),
      persistentKey: createLocalId(),
      ingredientCatalogItemId: null,
      userCustomIngredientId: null,
      selectedName: "",
      selectedSecondaryName: "",
      selectedSummary: "",
      familyDisplayName: "",
      brand: null,
      producer: null,
      brandName: null,
      manufacturer: null,
      countryCode: null,
      countryName: null,
      country: null,
      category,
      subtype: null,
      familyId: null,
      type: resolveLegacyIngredientType({ category }) ?? "hop",
      technicalData: null,
      defaultDisplayUnit: unitProfile.defaultUnit,
      allowedUnits: unitProfile.allowedUnits,
      measurementDimension: unitProfile.measurementDimension,
      amountEnteredQuantity: "",
      amountEnteredUnit: unitProfile.defaultUnit,
      stage: mapHopStageFromUseType(hopUseType),
      timeOffset: hopUseType === "boil" ? String(boilTimeMinutes) : "",
      stepMeta: {
        useType: hopUseType,
        timeMinutes: hopUseType === "boil"
          ? String(boilTimeMinutes)
          : hopUseType === "first_wort_hop" || hopUseType === "whirlpool" || hopUseType === "dip_hop" ? "" : undefined,
        temperatureC: hopUseType === "whirlpool" || hopUseType === "dip_hop" ? "" : undefined,
        durationDays: hopUseType === "dry_hop" ? "" : undefined
      },
      inventoryIntentMode: "use_stock",
      inventorySelectionMeta: null,
      externalImportMeta: null
    };
  }

  if (category === "fermentable") {
    return {
      localId: createLocalId(),
      persistentKey: createLocalId(),
      ingredientCatalogItemId: null,
      userCustomIngredientId: null,
      selectedName: "",
      selectedSecondaryName: "",
      selectedSummary: "",
      familyDisplayName: "",
      brand: null,
      producer: null,
      brandName: null,
      manufacturer: null,
      countryCode: null,
      countryName: null,
      country: null,
      category,
      subtype: fermentableSubtype,
      familyId: null,
      type: resolveLegacyIngredientType({ category, subtype: fermentableSubtype }) ?? "fermentable",
      technicalData: null,
      defaultDisplayUnit: unitProfile.defaultUnit,
      allowedUnits: unitProfile.allowedUnits,
      measurementDimension: unitProfile.measurementDimension,
      amountEnteredQuantity: "",
      amountEnteredUnit: unitProfile.defaultUnit,
      stage: "mash",
      timeOffset: "",
      stepMeta: {
        use: "mash"
      },
      inventoryIntentMode: "use_stock",
      inventorySelectionMeta: null,
      externalImportMeta: null
    };
  }

  return {
    localId: createLocalId(),
    persistentKey: createLocalId(),
    ingredientCatalogItemId: null,
    userCustomIngredientId: null,
    selectedName: "",
    selectedSecondaryName: "",
    selectedSummary: "",
    familyDisplayName: "",
    brand: null,
    producer: null,
    brandName: null,
    manufacturer: null,
    countryCode: null,
    countryName: null,
    country: null,
    category,
    subtype: null,
    familyId: null,
    type: resolveLegacyIngredientType({ category }) ?? "consumable",
    technicalData: null,
    defaultDisplayUnit: unitProfile.defaultUnit,
    allowedUnits: unitProfile.allowedUnits,
    measurementDimension: unitProfile.measurementDimension,
    amountEnteredQuantity: "",
    amountEnteredUnit: unitProfile.defaultUnit,
    stage: category === "yeast" ? "fermentation" : category === "water_treatment" ? "mash" : "other",
    timeOffset: "",
    stepMeta: {},
    inventoryIntentMode: "use_stock",
    inventorySelectionMeta: null,
    externalImportMeta: null
  };
};

/**
 * Смена типа добавления хмеля. При переходе на «Кипячение» подставляет видимый
 * дефолт «мин» — время кипячения рецепта: ровно то число, которое иначе молча
 * подставил бы расчёт IBU (createEmptyIngredient делает так же при создании
 * строки). Уже введённое пользователем время не перетираем; для остальных типов
 * дефолт не выдумываем — время хопстенда ≠ время кипячения.
 */
export const applyHopUseTypeChange = (
  draft: DesignerIngredient,
  nextUseType: RecipeHopUseType,
  boilTimeMinutes: number = DEFAULT_BOIL_TIME_MINUTES
): DesignerIngredient => {
  const enteredTimeMinutes = String(draft.stepMeta.timeMinutes ?? "").trim();
  const prefillBoilTime = nextUseType === "boil" && !enteredTimeMinutes;

  return {
    ...draft,
    stage: mapHopStageFromUseType(nextUseType),
    timeOffset: prefillBoilTime ? String(boilTimeMinutes) : draft.timeOffset,
    stepMeta: {
      ...draft.stepMeta,
      useType: nextUseType,
      timeMinutes: prefillBoilTime ? String(boilTimeMinutes) : draft.stepMeta.timeMinutes
    }
  };
};

export const applySelection = (current: DesignerIngredient, item: IngredientSuggestionItem): DesignerIngredient => {
  const nextCategory = item.category ?? current.category;
  const unitProfile = resolveHumanFacingInventoryUnitProfile({
    type: item.type,
    category: nextCategory,
    subtype: item.subtype ?? null,
    defaultDisplayUnit: item.defaultDisplayUnit ?? item.defaultUnit,
    allowedUnits: item.allowedUnits,
    measurementDimension: item.measurementDimension
  });
  const { primaryName, secondaryName } = resolveIngredientDisplayNames(item);
  const consumableStageOptions = nextCategory === "consumable"
    ? resolveRecipeConsumableStageOptions(item.technicalData ?? null)
    : null;
  const nextStage = consumableStageOptions
    ? current.stage !== "other" && consumableStageOptions.includes(current.stage)
      ? current.stage
      : resolveRecipeConsumableDefaultStage(item.technicalData ?? null)
    : current.stage;

  return {
    ...current,
    ingredientCatalogItemId: item.source === "catalog" ? item.id : null,
    userCustomIngredientId: item.source === "custom" ? item.id : null,
    selectedName: primaryName,
    selectedSecondaryName: secondaryName ?? "",
    selectedSummary: item.subtitle ?? "",
    familyDisplayName: item.familyDisplayName ?? "",
    brand: item.brand ?? null,
    producer: item.producer ?? null,
    brandName: item.brandName ?? null,
    manufacturer: item.manufacturer ?? null,
    countryCode: item.countryCode ?? null,
    countryName: item.countryName ?? null,
    country: item.country ?? null,
    category: nextCategory,
    subtype: item.subtype ?? null,
    familyId: item.familyId ?? null,
    type: item.type,
    technicalData: item.technicalData ?? null,
    defaultDisplayUnit: unitProfile.defaultUnit,
    allowedUnits: unitProfile.allowedUnits,
    measurementDimension: unitProfile.measurementDimension,
    amountEnteredUnit: unitProfile.defaultUnit,
    stage: nextStage,
    inventoryIntentMode: item.inventoryItemId ? "use_stock" : item.source === "custom" ? "custom" : "catalog",
    inventorySelectionMeta: item.inventoryItemId
      ? {
        inventoryItemId: item.inventoryItemId,
        stockQuantityLabel: item.inventoryQuantityLabel ?? null,
        stockNormalizedQuantity: item.inventoryNormalizedQuantity ?? null,
        stockNormalizedUnit: item.inventoryNormalizedUnit ?? null,
        freshnessDate: item.inventoryFreshnessDate ?? null,
        stockPurchasePriceLabel: item.inventoryPurchasePriceLabel ?? null,
        stockUnitPriceLabel: item.inventoryUnitPriceLabel ?? null,
        purchasedAt: item.inventoryPurchasedAt ?? null,
        updatedAt: item.inventoryUpdatedAt ?? null,
        notes: item.inventoryNotes ?? null,
        purchaseLinksCount: item.inventoryPurchaseLinksCount ?? null
      }
      : null
  };
};

export const applyQueryChange = (current: DesignerIngredient, nextValue: string): DesignerIngredient => {
  if (!current.ingredientCatalogItemId && !current.userCustomIngredientId) {
    return {
      ...current,
      selectedName: nextValue,
      selectedSecondaryName: "",
      brand: null,
      producer: null,
      brandName: null,
      manufacturer: null,
      countryCode: null,
      countryName: null,
      country: null,
      technicalData: null,
      inventoryIntentMode: current.inventoryIntentMode === "imported" ? "catalog" : current.inventoryIntentMode
    };
  }

  const unitProfile = resolveHumanFacingInventoryUnitProfile({
    category: current.category,
    subtype: resolveRecipeFermentableSubtype(current.category, current.subtype)
  });
  return {
    ...current,
    ingredientCatalogItemId: null,
    userCustomIngredientId: null,
    selectedName: nextValue,
    selectedSecondaryName: "",
    selectedSummary: "",
    familyDisplayName: "",
    brand: null,
    producer: null,
    brandName: null,
    manufacturer: null,
    countryCode: null,
    countryName: null,
    country: null,
    subtype: resolveRecipeFermentableSubtype(current.category, current.subtype),
    familyId: null,
    technicalData: null,
    defaultDisplayUnit: unitProfile.defaultUnit,
    allowedUnits: unitProfile.allowedUnits,
    measurementDimension: unitProfile.measurementDimension,
    amountEnteredUnit: unitProfile.defaultUnit,
    inventoryIntentMode: current.inventoryIntentMode === "use_stock" ? "use_stock" : "catalog",
    inventorySelectionMeta: null
  };
};

export const clearRecipeIngredientSelection = (current: DesignerIngredient): DesignerIngredient => {
  const cleared = applyQueryChange(current, "");

  return {
    ...cleared,
    inventoryIntentMode: current.inventoryIntentMode === "custom" ? "custom" : cleared.inventoryIntentMode,
    inventorySelectionMeta: null
  };
};

export const applyRecipeIngredientCategoryContextChange = (
  current: DesignerIngredient,
  nextCategory: IngredientCategory,
  nextSubtype: Extract<IngredientSubtype, "malt" | "fermentable"> | null = null,
  boilTimeMinutes: number = DEFAULT_BOIL_TIME_MINUTES
): DesignerIngredient => {
  const normalizedNextSubtype = resolveRecipeFermentableSubtype(nextCategory, nextSubtype);

  if (current.category === nextCategory && current.subtype === normalizedNextSubtype) {
    return current;
  }

  const nextDraft = createEmptyIngredient(
    nextCategory,
    nextCategory === "hop" ? getHopUseType(current) : "boil",
    normalizedNextSubtype,
    boilTimeMinutes
  );

  return {
    ...nextDraft,
    localId: current.localId,
    persistentKey: current.persistentKey,
    inventoryIntentMode: resolveRecipeIngredientEditorSourceMode(current.inventoryIntentMode),
    inventorySelectionMeta: null
  };
};

export const readInventorySelectionMetaString = (
  meta: RecipeInventorySelectionMeta | null,
  key: string
) => {
  const value = meta?.[key];
  return typeof value === "string" && value.trim() ? value : null;
};

export const readInventorySelectionMetaNumber = (
  meta: RecipeInventorySelectionMeta | null,
  key: string
) => {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export const buildSelectedIngredientPreview = (ingredient: DesignerIngredient): IngredientSuggestionItem | null => {
  const id = ingredient.userCustomIngredientId ?? ingredient.ingredientCatalogItemId;
  if (!id || !ingredient.selectedName.trim()) {
    return null;
  }

  const meta = ingredient.inventorySelectionMeta;
  return {
    id,
    type: ingredient.type,
    category: ingredient.category,
    subtype: ingredient.subtype,
    familyId: ingredient.familyId,
    familyDisplayName: ingredient.familyDisplayName || null,
    displayName: ingredient.selectedName,
    primaryLabelRu: ingredient.selectedName,
    secondaryLabelRu: ingredient.selectedSecondaryName || null,
    subtitle: ingredient.selectedSummary || undefined,
    brand: ingredient.brand,
    producer: ingredient.producer,
    brandName: ingredient.brandName,
    manufacturer: ingredient.manufacturer,
    countryCode: ingredient.countryCode,
    countryName: ingredient.countryName,
    country: ingredient.country,
    technicalData: ingredient.technicalData,
    defaultUnit: ingredient.defaultDisplayUnit,
    defaultDisplayUnit: ingredient.defaultDisplayUnit,
    allowedUnits: ingredient.allowedUnits,
    measurementDimension: ingredient.measurementDimension ?? undefined,
    source: ingredient.userCustomIngredientId ? "custom" : "catalog",
    inventoryItemId: meta?.inventoryItemId ?? null,
    inventoryQuantityLabel: meta?.stockQuantityLabel ?? null,
    inventoryNormalizedQuantity: meta?.stockNormalizedQuantity ?? null,
    inventoryNormalizedUnit: meta?.stockNormalizedUnit ?? null,
    inventoryPurchasePriceLabel: readInventorySelectionMetaString(meta, "stockPurchasePriceLabel"),
    inventoryUnitPriceLabel: readInventorySelectionMetaString(meta, "stockUnitPriceLabel"),
    inventoryPurchasedAt: readInventorySelectionMetaString(meta, "purchasedAt"),
    inventoryFreshnessDate: meta?.freshnessDate ?? null,
    inventoryUpdatedAt: readInventorySelectionMetaString(meta, "updatedAt"),
    inventoryNotes: readInventorySelectionMetaString(meta, "notes"),
    inventoryPurchaseLinksCount: readInventorySelectionMetaNumber(meta, "purchaseLinksCount")
  };
};

export const serializeIngredient = (ingredient: DesignerIngredient) => JSON.stringify(ingredient);

export const getHopUseType = (ingredient: DesignerIngredient) => ingredient.stepMeta.useType ?? (
  ingredient.stage === "boil"
    ? "boil"
    : ingredient.stage === "whirlpool"
      ? "whirlpool"
      : ingredient.stage === "fermentation"
        ? "dry_hop"
        : "other"
);

export const buildIngredientPayload = (ingredient: DesignerIngredient): RecipeEditorPayload["ingredients"][number] => {
  const timeMinutes = toOptionalNumber(ingredient.stepMeta.timeMinutes ?? "");
  const fermentationTempC = toOptionalNumber(ingredient.stepMeta.fermentationTempC ?? "");
  const temperatureC = toOptionalNumber(ingredient.stepMeta.temperatureC ?? "");
  const durationDays = toOptionalNumber(ingredient.stepMeta.durationDays ?? "");
  const stepMeta: Record<string, unknown> = {};

  if (ingredient.category === "fermentable" && ingredient.stepMeta.use && ingredient.stepMeta.use !== "mash") {
    stepMeta.use = ingredient.stepMeta.use;
  }

  if (ingredient.category === "hop") {
    stepMeta.useType = getHopUseType(ingredient);
  }

  if (timeMinutes != null) {
    stepMeta.timeMinutes = timeMinutes;
  }

  if (temperatureC != null) {
    stepMeta.temperatureC = temperatureC;
  }

  if (durationDays != null) {
    stepMeta.durationDays = durationDays;
  }

  if (fermentationTempC != null) {
    stepMeta.fermentationTempC = fermentationTempC;
  }

  if (ingredient.stepMeta.stageLabel?.trim()) {
    stepMeta.stageLabel = ingredient.stepMeta.stageLabel.trim();
  }

  return {
    persistentKey: ingredient.persistentKey,
    ingredientCatalogItemId: ingredient.ingredientCatalogItemId,
    userCustomIngredientId: ingredient.userCustomIngredientId,
    type: ingredient.type,
    category: ingredient.category,
    subtype: ingredient.subtype,
    familyId: ingredient.familyId,
    amountEnteredQuantity: Number(ingredient.amountEnteredQuantity),
    amountEnteredUnit: ingredient.amountEnteredUnit,
    stage: ingredient.category === "hop" ? mapHopStageFromUseType(getHopUseType(ingredient)) : ingredient.stage,
    timeOffset: timeMinutes,
    stepMeta: Object.keys(stepMeta).length ? stepMeta : null,
    inventoryIntentMode: ingredient.inventoryIntentMode,
    inventorySelectionMeta: ingredient.inventorySelectionMeta,
    externalImportMeta: ingredient.externalImportMeta
  };
};

export const toDesignerIngredient = (ingredient: RecipeDetailDto["ingredients"][number]): DesignerIngredient => {
  const category = ingredient.ingredientCategory ?? resolveIngredientCategory({ type: ingredient.type });
  const unitProfile = resolveHumanFacingInventoryUnitProfile({
    type: ingredient.type,
    category,
    subtype: ingredient.ingredientSubtype ?? null,
    defaultDisplayUnit: ingredient.ingredientDefaultDisplayUnit ?? ingredient.ingredientDefaultDisplayUnitSnapshot ?? ingredient.amountEnteredUnit,
    allowedUnits: ingredient.ingredientAllowedUnits ?? [ingredient.amountEnteredUnit],
    measurementDimension: ingredient.ingredientMeasurementDimension ?? ingredient.ingredientMeasurementDimensionSnapshot ?? null
  });
  const displayMeasurement = resolveInventoryMeasurementForDisplay({
    enteredQuantity: ingredient.amountEnteredQuantity,
    enteredUnit: ingredient.amountEnteredUnit,
    normalizedQuantity: ingredient.amountNormalizedQuantity,
    normalizedUnit: ingredient.amountNormalizedUnit,
    type: ingredient.type,
    category,
    subtype: ingredient.ingredientSubtype ?? null,
    defaultDisplayUnit: unitProfile.defaultUnit,
    allowedUnits: ingredient.ingredientAllowedUnits ?? unitProfile.allowedUnits,
    measurementDimension: ingredient.ingredientMeasurementDimension ?? ingredient.ingredientMeasurementDimensionSnapshot ?? unitProfile.measurementDimension
  });
  const stepMeta = (ingredient.stepMeta ?? {}) as Record<string, unknown>;
  const ingredientNames = resolveIngredientDisplayNames({
    displayName: ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameSnapshot ?? "",
    displayNameRu: ingredient.ingredientDisplayNameRu,
    displayNameEn: ingredient.ingredientDisplayNameEn
  });

  return {
    localId: ingredient.persistentKey ?? ingredient.id,
    persistentKey: ingredient.persistentKey ?? ingredient.id,
    ingredientCatalogItemId: ingredient.ingredientCatalogItemId,
    userCustomIngredientId: ingredient.userCustomIngredientId,
    selectedName: ingredientNames.primaryName,
    selectedSecondaryName: ingredientNames.secondaryName ?? "",
    selectedSummary: ingredient.ingredientSummary ?? "",
    familyDisplayName: ingredient.ingredientFamilyDisplayName ?? "",
    brand: ingredient.ingredientBrand ?? null,
    producer: ingredient.ingredientProducer ?? null,
    brandName: ingredient.ingredientBrandName ?? null,
    manufacturer: ingredient.ingredientManufacturer ?? null,
    countryCode: ingredient.ingredientCountryCode ?? null,
    countryName: ingredient.ingredientCountryName ?? null,
    country: ingredient.ingredientCountry ?? null,
    category,
    subtype: ingredient.ingredientSubtype ?? null,
    familyId: ingredient.ingredientFamilyId ?? null,
    type: ingredient.type,
    technicalData: ingredient.ingredientTechnicalData ?? null,
    defaultDisplayUnit: unitProfile.defaultUnit,
    allowedUnits: ingredient.ingredientAllowedUnits ?? unitProfile.allowedUnits,
    measurementDimension: ingredient.ingredientMeasurementDimension ?? ingredient.ingredientMeasurementDimensionSnapshot ?? unitProfile.measurementDimension,
    amountEnteredQuantity: formatInventoryQuantityInputValue(displayMeasurement.quantity),
    amountEnteredUnit: displayMeasurement.unit,
    stage: ingredient.stage,
    timeOffset: ingredient.timeOffset == null ? "" : String(ingredient.timeOffset),
    stepMeta: {
      use: typeof stepMeta.use === "string" ? stepMeta.use : null,
      useType: typeof stepMeta.useType === "string" ? stepMeta.useType as RecipeHopUseType : null,
      timeMinutes: typeof stepMeta.timeMinutes === "number" ? String(stepMeta.timeMinutes) : ingredient.timeOffset == null ? "" : String(ingredient.timeOffset),
      temperatureC: typeof stepMeta.temperatureC === "number" ? String(stepMeta.temperatureC) : "",
      durationDays: typeof stepMeta.durationDays === "number" ? String(stepMeta.durationDays) : "",
      fermentationTempC: typeof stepMeta.fermentationTempC === "number" ? String(stepMeta.fermentationTempC) : "",
      stageLabel: typeof stepMeta.stageLabel === "string" ? stepMeta.stageLabel : ""
    },
    inventoryIntentMode: ingredient.inventoryIntentMode ?? "catalog",
    inventorySelectionMeta: ingredient.inventorySelectionMeta ?? null,
    externalImportMeta: ingredient.externalImportMeta ?? null
  };
};

export const buildInitialPreview = (recipe?: RecipeDetailDto): RecipeDraftPreviewDto | null => {
  if (!recipe) {
    return null;
  }

  const styleRange = getStyleRangeById(recipe.styleId);
  const hasAnyMetric = recipe.og != null || recipe.fg != null || recipe.abv != null || recipe.ibu != null || recipe.color != null;
  const styleFit = styleRange && hasAnyMetric
    ? evaluateStyleFit(styleRange, {
      og: recipe.og ?? 0,
      fg: recipe.fg ?? 0,
      abv: recipe.abv ?? 0,
      ibu: recipe.ibu ?? 0,
      srm: recipe.color ?? 0
    })
    : null;

  return {
    batchSizeEnteredQuantity: recipe.batchSizeEnteredQuantity,
    batchSizeEnteredUnit: recipe.batchSizeEnteredUnit,
    boilTimeMinutes: recipe.boilTimeMinutes,
    og: recipe.og,
    fg: recipe.fg,
    fgEstimateMode: recipe.fgEstimateMode ?? recipe.calculationMeta?.fgEstimateMode ?? (recipe.fg != null ? "default_estimate" : "unavailable"),
    fgEstimateDetails: recipe.fgEstimateDetails ?? recipe.calculationMeta?.fgEstimateDetails ?? null,
    abv: recipe.abv,
    ibu: recipe.ibu,
    bitternessFormula: recipe.calculationMeta?.bitternessFormula ?? "tinseth_whirlpool_v2",
    color: recipe.color,
    styleId: recipe.styleId,
    styleRange,
    styleFit
  };
};

export const buildEditorPayloadFromRecipe = (
  recipe: RecipeDetailDto,
  ingredients: DesignerIngredient[] = recipe.ingredients.map(toDesignerIngredient)
): RecipeEditorPayload => normalizeSavePayload({
  title: recipe.title,
  styleId: recipe.styleId ?? null,
  description: recipe.description ?? null,
  authorNotes: recipe.authorNotes ?? null,
  publicationState: normalizeEditorPublicationState(recipe.publicationState),
  batchSizeEnteredQuantity: recipe.batchSizeEnteredQuantity,
  batchSizeEnteredUnit: recipe.batchSizeEnteredUnit,
  efficiency: recipe.efficiency ?? null,
  boilTimeMinutes: recipe.boilTimeMinutes,
  processMeta: cloneRecipeProcessMeta(recipe.processMeta),
  calculationMeta: cloneRecipeCalculationMeta(recipe.calculationMeta ?? null),
  equipmentProfileId: recipe.equipmentProfileId ?? null,
  equipmentProfileSnapshot: cloneEquipmentProfileSnapshot(recipe.equipmentProfileSnapshot ?? null),
  waterPlanMeta: cloneRecipeWaterPlanMeta(recipe.waterPlanMeta ?? null),
  ingredients: ingredients.map(buildIngredientPayload)
});

export const buildSummaryDetails = (ingredient: DesignerIngredient) => {
  const details: string[] = [];

  if (ingredient.category === "fermentable" && ingredient.stepMeta.use && ingredient.stepMeta.use !== "mash") {
    details.push(fermentableUseLabels[ingredient.stepMeta.use as keyof typeof fermentableUseLabels] ?? ingredient.stepMeta.use);
    if (ingredient.stepMeta.use === "boil" && ingredient.stepMeta.timeMinutes) {
      details.push(`${ingredient.stepMeta.timeMinutes} мин`);
    }
  }

  if (ingredient.category === "hop") {
    const useType = getHopUseType(ingredient);
    details.push(hopUseTypeLabels[useType]);
    if (useType === "boil" || useType === "first_wort_hop" || useType === "whirlpool" || useType === "dip_hop") {
      if (ingredient.stepMeta.timeMinutes) {
        details.push(`${ingredient.stepMeta.timeMinutes} мин`);
      }
    }
    if ((useType === "whirlpool" || useType === "dip_hop") && ingredient.stepMeta.temperatureC) {
      details.push(`${ingredient.stepMeta.temperatureC} °C`);
    }
    if (useType === "dry_hop" && ingredient.stepMeta.durationDays) {
      details.push(`${ingredient.stepMeta.durationDays} дн`);
    }
  }

  if (ingredient.category === "yeast" && ingredient.stepMeta.fermentationTempC) {
    details.push(`${ingredient.stepMeta.fermentationTempC} °C`);
  }

  if ((ingredient.category === "water_treatment" || ingredient.category === "consumable") && ingredient.stage !== "other") {
    details.push(stageLabels[ingredient.stage]);
  }

  if (ingredient.category === "consumable" && ingredient.stepMeta.timeMinutes) {
    details.push(`${ingredient.stepMeta.timeMinutes} мин`);
  }

  if (ingredient.stepMeta.stageLabel?.trim()) {
    details.push(ingredient.stepMeta.stageLabel.trim());
  }

  return details.join(" • ");
};

export const getQuantityText = (ingredient: DesignerIngredient) => `${ingredient.amountEnteredQuantity || "—"} ${inventoryUnitLabels[ingredient.amountEnteredUnit] ?? ingredient.amountEnteredUnit}`;

export const buildDesignerIngredientCardSource = (ingredient: DesignerIngredient): RecipeIngredientCardSource => ({
  type: ingredient.type,
  category: ingredient.category,
  subtype: ingredient.subtype,
  brand: ingredient.brand,
  producer: ingredient.producer,
  brandName: ingredient.brandName,
  manufacturer: ingredient.manufacturer,
  countryCode: ingredient.countryCode,
  countryName: ingredient.countryName,
  country: ingredient.country,
  technicalData: ingredient.technicalData
});

export const getSectionTitle = (category: IngredientCategory) => {
  if (category === "fermentable") return "Сбраживаемое";
  if (category === "hop") return "Хмель";
  if (category === "yeast") return "Дрожжи";
  if (category === "water_treatment") return "Водоподготовка";
  return "Специи и добавки";
};

export const categoryIcons: Record<IngredientCategory, React.ComponentType<{ className?: string }>> = {
  fermentable: Wheat,
  hop: Hop,
  yeast: FlaskConical,
  water_treatment: Droplets,
  consumable: Package
};

export const categoryAccentBorder: Record<IngredientCategory, string> = {
  fermentable: "border-l-amber-400",
  hop: "border-l-emerald-500",
  yeast: "border-l-violet-400",
  water_treatment: "border-l-sky-400",
  consumable: "border-l-border"
};

export const categoryIconBg: Record<IngredientCategory, string> = {
  fermentable: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  hop: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  yeast: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
  water_treatment: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400",
  consumable: "bg-muted text-muted-foreground"
};

export const getCategoryRows = (ingredients: DesignerIngredient[], category: IngredientCategory) => ingredients.filter((ingredient) => ingredient.category === category);

export const getFermentableWeightTotalKg = (ingredients: DesignerIngredient[]) => {
  return ingredients.reduce((sum, ingredient) => {
    const quantity = Number(ingredient.amountEnteredQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return sum;
    }

    if (!["g", "kg", "oz", "lb"].includes(ingredient.amountEnteredUnit)) {
      return sum;
    }

    return sum + convertWeight({ value: quantity, unit: ingredient.amountEnteredUnit as "g" | "kg" | "oz" | "lb" }, "kg").value;
  }, 0);
};

export const getBatchVolumeLiters = (quantityInput: string, unit: InventoryUnit): number | null => {
  const quantity = Number(quantityInput);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (!["ml", "l", "gal"].includes(unit)) return null;
  return convertVolume({ value: quantity, unit: unit as "ml" | "l" | "gal" }, "l").value;
};

/**
 * Когда показывать инлайн-действие «Пересчитать под объём» (#6): только если
 * известен и сохранённый, и текущий объём, они реально разошлись (не шум
 * округления) и в рецепте есть что масштабировать. Чистый хелпер — без React,
 * чтобы поведение проверялось юнит-тестом отдельно от рендера всего дизайнера.
 */
export const shouldShowRescaleToVolumeAction = (input: {
  savedBatchVolumeL: number | null;
  currentBatchVolumeL: number | null;
  ingredientCount: number;
}): boolean => (
  input.savedBatchVolumeL != null
  && input.savedBatchVolumeL > 0
  && input.currentBatchVolumeL != null
  && input.currentBatchVolumeL > 0
  && Math.abs(input.currentBatchVolumeL - input.savedBatchVolumeL) > 0.001
  && input.ingredientCount > 0
);

/**
 * Мини-адаптер черновика дизайнера рецепта под вход чистой `scaleRecipeToVolume`
 * (features/recipes/scale.ts, не меняется — эта функция читает из RecipeDetailDto
 * только объём партии (entered/normalized) и по каждому ингредиенту: id/persistentKey,
 * displayName, entered/normalized количество+unit, stage. Другие поля DTO ей не нужны,
 * поэтому здесь заполняются только они, а не «наигрывается» полный RecipeDetailDto с
 * технической/складской обвязкой, которой в черновике ещё нет. persistentKey драфта
 * пробрасывается как id/persistentKey — этого достаточно, чтобы сопоставить результат
 * обратно с состоянием после масштабирования (recipe-designer, «Пересчитать под объём»).
 */
export const buildDesignerScaleInput = (
  ingredients: DesignerIngredient[],
  baseBatchVolumeL: number
): RecipeDetailDto => ({
  batchSizeEnteredQuantity: baseBatchVolumeL,
  batchSizeEnteredUnit: "l",
  batchSizeNormalizedQuantity: baseBatchVolumeL * 1000,
  batchSizeNormalizedUnit: "ml",
  ingredients: ingredients.map((ingredient) => ({
    id: ingredient.persistentKey,
    persistentKey: ingredient.persistentKey,
    ingredientDisplayName: ingredient.selectedName || null,
    ingredientDisplayNameSnapshot: null,
    amountEnteredQuantity: Number(ingredient.amountEnteredQuantity || 0),
    amountEnteredUnit: ingredient.amountEnteredUnit,
    amountNormalizedQuantity: Number(ingredient.amountEnteredQuantity || 0),
    amountNormalizedUnit: ingredient.amountEnteredUnit,
    stage: ingredient.stage
  }))
} as unknown as RecipeDetailDto);

export const getIngredientWeightKg = (ingredient: DesignerIngredient): number => {
  const quantity = Number(ingredient.amountEnteredQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  if (!["g", "kg", "oz", "lb"].includes(ingredient.amountEnteredUnit)) return 0;
  return convertWeight({ value: quantity, unit: ingredient.amountEnteredUnit as "g" | "kg" | "oz" | "lb" }, "kg").value;
};

export const getFermentablesForWaterPlan = (ingredients: DesignerIngredient[]): RecipeWaterPlanFermentableInput[] => (
  ingredients
    .filter((ingredient) => ingredient.category === "fermentable")
    .map((ingredient) => ({
      name: ingredient.selectedName,
      subtype: ingredient.subtype,
      weightKg: getIngredientWeightKg(ingredient)
    }))
    .filter((ingredient) => ingredient.weightKg > 0)
);

export const getFermentablePercentage = (ingredient: DesignerIngredient, totalKg: number): number | null => {
  if (totalKg <= 0) return null;
  const kg = getIngredientWeightKg(ingredient);
  if (kg <= 0) return null;
  return (kg / totalKg) * 100;
};

export const getHopWeightTotalG = (ingredients: DesignerIngredient[]) => {
  return ingredients.reduce((sum, ingredient) => {
    const quantity = Number(ingredient.amountEnteredQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return sum;
    if (!["g", "kg", "oz", "lb"].includes(ingredient.amountEnteredUnit)) return sum;
    return sum + convertWeight({ value: quantity, unit: ingredient.amountEnteredUnit as "g" | "kg" | "oz" | "lb" }, "g").value;
  }, 0);
};

export const getHopTimeMinutesValue = (ingredient: DesignerIngredient) => {
  const value = Number(ingredient.stepMeta.timeMinutes ?? "");
  return Number.isFinite(value) ? value : -1;
};

export const isRecipeDesignerRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && !Array.isArray(value)
);

export const readImportedDesignerIngredientSnapshot = (ingredient: DesignerIngredient): RecipeImportedIngredientSnapshot | null => {
  const snapshot = ingredient.externalImportMeta?.importedIngredient;
  if (!isRecipeDesignerRecord(snapshot) || snapshot.version !== 1 || typeof snapshot.name !== "string") {
    return null;
  }

  return snapshot as unknown as RecipeImportedIngredientSnapshot;
};

export const isImportedDesignerIngredient = (ingredient: DesignerIngredient) => (
  ingredient.inventoryIntentMode === "imported"
  && !ingredient.ingredientCatalogItemId
  && !ingredient.userCustomIngredientId
  && readImportedDesignerIngredientSnapshot(ingredient) != null
);

export const isIngredientValid = (ingredient: DesignerIngredient) => {
  if (!ingredient.ingredientCatalogItemId && !ingredient.userCustomIngredientId && !isImportedDesignerIngredient(ingredient)) {
    return false;
  }

  const quantity = Number(ingredient.amountEnteredQuantity);
  return Number.isFinite(quantity) && quantity > 0;
};

export const getIngredientDraftFieldError = (ingredient: DesignerIngredient) => {
  if (!ingredient.ingredientCatalogItemId && !ingredient.userCustomIngredientId && !isImportedDesignerIngredient(ingredient)) {
    return "Выберите ингредиент.";
  }

  const quantityError = validateNumericInput(ingredient.amountEnteredQuantity, {
    label: "Количество",
    required: true,
    min: 0,
    exclusiveMin: true
  });
  if (quantityError) {
    return quantityError;
  }

  const hopUseType = ingredient.category === "hop" ? getHopUseType(ingredient) : null;
  const use = typeof ingredient.stepMeta.use === "string" ? ingredient.stepMeta.use : null;
  // Для хмеля в котёл / вирпул / dip hop время задаёт горечь, поэтому оно обязательно:
  // иначе расчёт молча подставит дефолт (время кипения рецепта или 0).
  const hopTimeRequired = hopUseType === "boil" || hopUseType === "whirlpool" || hopUseType === "dip_hop";
  if (
    (ingredient.category === "fermentable" && use === "boil")
    || hopTimeRequired
    || ingredient.category === "water_treatment"
    || ingredient.category === "consumable"
  ) {
    const timeError = validateNumericInput(String(ingredient.stepMeta.timeMinutes ?? ""), {
      label: "Время",
      required: hopTimeRequired,
      min: 0,
      max: 600,
      integer: true
    });
    if (timeError) {
      return timeError;
    }
  }

  if (hopUseType === "dry_hop") {
    const durationError = validateNumericInput(String(ingredient.stepMeta.durationDays ?? ""), {
      label: "Длительность",
      min: 0,
      max: 365,
      integer: true,
      exclusiveMin: true
    });
    if (durationError) {
      return durationError;
    }
  }

  if (hopUseType === "whirlpool" || hopUseType === "dip_hop") {
    const temperatureError = validateNumericInput(String(ingredient.stepMeta.temperatureC ?? ""), {
      label: "Температура",
      min: 0,
      max: 100
    });
    if (temperatureError) {
      return temperatureError;
    }
  }

  if (ingredient.category === "yeast") {
    const temperatureError = validateNumericInput(String(ingredient.stepMeta.fermentationTempC ?? ""), {
      label: "Температура брожения",
      min: -10,
      max: 50
    });
    if (temperatureError) {
      return temperatureError;
    }
  }

  return null;
};

export const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

export const getMetricPositionPercent = (value: number | null, min: number, max: number) => {
  if (value == null || max <= min) {
    return null;
  }

  return clampPercent(((value - min) / (max - min)) * 100);
};

export const getMetricStatusAppearance = (status: "in_range" | "below" | "above" | "no_style" | null) => {
  if (status === "in_range") {
    return {
      label: "В стиле",
      badgeClassName: "text-success",
      needleClassName: "bg-success",
      needleDotClassName: "bg-success ring-2 ring-background shadow"
    };
  }

  if (status === "below") {
    return {
      label: "Ниже",
      badgeClassName: "text-muted-foreground",
      needleClassName: "bg-muted-foreground",
      needleDotClassName: "bg-muted-foreground ring-2 ring-background shadow"
    };
  }

  if (status === "above") {
    return {
      label: "Выше",
      badgeClassName: "text-muted-foreground",
      needleClassName: "bg-muted-foreground",
      needleDotClassName: "bg-muted-foreground ring-2 ring-background shadow"
    };
  }

  if (status === "no_style") {
    return {
      label: "—",
      badgeClassName: "text-muted-foreground",
      needleClassName: "bg-sky-400",
      needleDotClassName: "bg-sky-400 ring-2 ring-background shadow"
    };
  }

  return {
    label: "—",
    badgeClassName: "text-muted-foreground",
    needleClassName: "bg-muted-foreground",
    needleDotClassName: "bg-muted-foreground ring-2 ring-background shadow"
  };
};
export const searchStockIngredientsForRecipe = async ({
  q,
  type,
  category,
  subtype,
  group,
  limit,
  signal
}: {
  q: string;
  type?: IngredientType;
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  group?: string;
  limit: number;
  signal: AbortSignal;
}) => {
  const params = buildRecipeStockIngredientSearchParams({
    q,
    type,
    category,
    subtype,
    group,
    limit
  });

  const response = await fetch(`/api/inventory/suggestions?${params.toString()}`, { signal });
  if (!response.ok) {
    return [] as IngredientSuggestionItem[];
  }

  const data = await response.json() as { items?: IngredientSuggestionItem[] };
  const items = data.items ?? [];
  if (category === "water_treatment") {
    return filterRecipeWaterAddFlowSuggestions(items);
  }

  const normalizedGroup = category === "fermentable" && subtype === "fermentable"
    ? canonicalizeFermentableQuickStartGroup(group)
    : null;
  if (!normalizedGroup) {
    return items;
  }

  return items.filter((item) => (
    canonicalizeFermentableQuickStartGroup(item.groupName ?? null) === normalizedGroup
  ));
};

export const buildRecipeStockIngredientSearchParams = ({
  q,
  type,
  category,
  subtype,
  group,
  limit
}: {
  q: string;
  type?: IngredientType;
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  group?: string;
  limit: number;
}) => {
  const params = new URLSearchParams();
  const effectiveType = resolveRecipeIngredientSearchType({ category, type });
  params.set("q", q);
  params.set("limit", String(limit));
  params.set("stock", "in_stock");
  params.set("dedupe", "false");
  if (effectiveType) params.set("type", effectiveType);
  if (category) params.set("category", category);
  if (subtype) params.set("subtype", subtype);
  if (group) params.set("group", group);
  return params;
};

export const recipeWaterAddFlowCatalogIdOrder = new Map(
  recipeWaterAddFlowCatalogIds.map((id, index) => [id, index])
);
export const recipeWaterAddFlowCatalogIdSet = new Set(recipeWaterAddFlowCatalogIds);
export const recipeWaterManualSaltIdSet = new Set<string>(recipeWaterManualSaltIds);
export const recipeWaterAddFlowDefaultGroups = ["salt", "base"] as const;

export const isRecipeWaterAddFlowSuggestion = (item: IngredientSuggestionItem) => (
  item.category === "water_treatment"
  && item.source === "catalog"
  && recipeWaterAddFlowCatalogIdSet.has(item.id)
);

export const filterRecipeWaterAddFlowSuggestions = (
  items: IngredientSuggestionItem[],
): IngredientSuggestionItem[] => {
  const seen = new Set<string>();

  return items
    .filter(isRecipeWaterAddFlowSuggestion)
    .filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }

      seen.add(item.id);
      return true;
    })
    .sort((left, right) => (
      (recipeWaterAddFlowCatalogIdOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER)
      - (recipeWaterAddFlowCatalogIdOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      || left.displayName.localeCompare(right.displayName, "ru")
    ));
};

export type RecipeWaterManualSaltAddition =
  NonNullable<RecipeWaterPlanMeta["manualSaltAdditions"]>[number];

export type RecipeWaterAddFlowSaltIngredientInput = Pick<
  DesignerIngredient,
  | "amountEnteredQuantity"
  | "amountEnteredUnit"
  | "category"
  | "ingredientCatalogItemId"
>;

export const recipeWaterManualSaltWeightUnits = ["g", "kg", "oz", "lb"] as const;

export type RecipeWaterManualSaltWeightUnit =
  (typeof recipeWaterManualSaltWeightUnits)[number];

export const isRecipeWaterManualSaltWeightUnit = (
  unit: InventoryUnit,
): unit is RecipeWaterManualSaltWeightUnit =>
  recipeWaterManualSaltWeightUnits.includes(
    unit as RecipeWaterManualSaltWeightUnit,
  );

export const roundRecipeWaterSaltGrams = (grams: number) =>
  Number(grams.toFixed(2));

export const toRecipeWaterSaltGrams = (
  quantity: string,
  unit: InventoryUnit,
): number | null => {
  const value = Number(quantity);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  if (!isRecipeWaterManualSaltWeightUnit(unit)) {
    return null;
  }

  const grams =
    unit === "g" ? value : convertWeight({ value, unit }, "g").value;

  return Number.isFinite(grams) && grams > 0
    ? roundRecipeWaterSaltGrams(grams)
    : null;
};

export const resolveRecipeWaterManualSaltAdditionFromIngredient = (
  ingredient: RecipeWaterAddFlowSaltIngredientInput,
): RecipeWaterManualSaltAddition | null => {
  if (ingredient.category !== "water_treatment") {
    return null;
  }

  const salt = resolveRecipeWaterSaltIdFromCatalogId(
    ingredient.ingredientCatalogItemId,
  );
  const grams = toRecipeWaterSaltGrams(
    ingredient.amountEnteredQuantity,
    ingredient.amountEnteredUnit,
  );

  if (!salt || grams == null) {
    return null;
  }

  return { salt, grams, target: "all" };
};

export const normalizeRecipeWaterManualSaltAddition = (
  addition: RecipeWaterManualSaltAddition,
): RecipeWaterManualSaltAddition | null => {
  if (
    typeof addition.salt !== "string"
    || !recipeWaterManualSaltIdSet.has(addition.salt)
    || addition.grams <= 0
  ) {
    return null;
  }

  const salt = addition.salt as BrewingSaltId;
  const target: RecipeWaterManualSaltAdditionTarget =
    addition.target === "mash" || addition.target === "sparge"
      ? addition.target
      : "all";

  return {
    salt,
    grams: roundRecipeWaterSaltGrams(addition.grams),
    target,
  };
};

export const snapshotRecipeWaterResultSaltAdditions = (
  waterPlanResult: RecipeWaterPlanResult,
): RecipeWaterManualSaltAddition[] => {
  const additions =
    waterPlanResult.waterVolumes.source === "manual_split"
      ? [
          ...waterPlanResult.mashSaltAdditions.map((addition) => ({
            salt: addition.salt,
            grams: addition.grams,
            target: "mash" as RecipeWaterManualSaltAdditionTarget,
          })),
          ...waterPlanResult.spargeSaltAdditions.map((addition) => ({
            salt: addition.salt,
            grams: addition.grams,
            target: "sparge" as RecipeWaterManualSaltAdditionTarget,
          })),
        ]
      : waterPlanResult.totalSaltAdditions.map((addition) => ({
          salt: addition.salt,
          grams: addition.grams,
          target: addition.target,
        }));

  return additions
    .map((addition) => normalizeRecipeWaterManualSaltAddition(addition))
    .filter((addition): addition is RecipeWaterManualSaltAddition =>
      addition !== null,
    );
};

export const seedRecipeWaterManualSaltAdditions = (
  waterPlanMeta: RecipeWaterPlanMeta,
  waterPlanResult: RecipeWaterPlanResult,
): RecipeWaterManualSaltAddition[] => {
  const existing = (waterPlanMeta.manualSaltAdditions ?? [])
    .map(normalizeRecipeWaterManualSaltAddition)
    .filter((addition): addition is RecipeWaterManualSaltAddition =>
      addition !== null,
    );

  if (waterPlanMeta.engine === "advanced_manual") {
    return existing;
  }

  return snapshotRecipeWaterResultSaltAdditions(waterPlanResult);
};

export const mergeRecipeWaterManualSaltAddition = (
  additions: RecipeWaterManualSaltAddition[],
  addition: RecipeWaterManualSaltAddition,
): RecipeWaterManualSaltAddition[] => {
  const target = addition.target ?? "all";
  const index = additions.findIndex(
    (item) => item.salt === addition.salt && (item.target ?? "all") === target,
  );

  if (index < 0) {
    return [...additions, addition];
  }

  return additions.map((item, itemIndex) =>
    itemIndex === index
      ? {
          ...item,
          grams: roundRecipeWaterSaltGrams(item.grams + addition.grams),
          target,
        }
      : item,
  );
};

export const applyRecipeWaterAddFlowSaltToWaterPlan = ({
  waterPlanMeta,
  waterPlanResult,
  ingredient,
}: {
  waterPlanMeta: RecipeWaterPlanMeta;
  waterPlanResult: RecipeWaterPlanResult;
  ingredient: RecipeWaterAddFlowSaltIngredientInput;
}): RecipeWaterPlanMeta | null => {
  const addition = resolveRecipeWaterManualSaltAdditionFromIngredient(ingredient);
  if (!addition) {
    return null;
  }

  const baseAdditions = waterPlanMeta.engine === "advanced_manual"
    ? seedRecipeWaterManualSaltAdditions(waterPlanMeta, waterPlanResult)
    : [];

  return {
    ...waterPlanMeta,
    setupEnabled: true,
    engine: "advanced_manual",
    manualSaltAdditions: mergeRecipeWaterManualSaltAddition(
      baseAdditions,
      addition,
    ),
  };
};

export const fetchRecipeCatalogIngredientsForPicker = async (params: URLSearchParams, signal: AbortSignal) => {
  const response = await fetch(`/api/ingredients/search?${params.toString()}`, { signal });
  if (!response.ok) {
    return [] as IngredientSuggestionItem[];
  }

  const data = await response.json() as IngredientSearchResult;
  return data.items ?? [];
};

export const searchRecipeWaterAddFlowCatalogIngredients = async ({
  q,
  type,
  category,
  subtype,
  family,
  group,
  manufacturer,
  favoritesOnly,
  customOnly,
  limit,
  signal
}: {
  q: string;
  type?: IngredientType;
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  family?: string;
  group?: string;
  manufacturer?: string;
  favoritesOnly?: boolean;
  customOnly?: boolean;
  includeCustom?: boolean;
  limit: number;
  signal: AbortSignal;
}): Promise<IngredientSuggestionItem[]> => {
  const requestedLimit = Math.max(limit, recipeWaterAddFlowCatalogIds.length);
  const base = {
    q,
    type,
    category,
    subtype,
    family,
    manufacturer,
    favoritesOnly,
    customOnly,
    includeCustom: false,
    limit: requestedLimit
  };

  if (q.trim() || group) {
    const params = buildIngredientSearchParams({
      ...base,
      group
    });
    return filterRecipeWaterAddFlowSuggestions(
      await fetchRecipeCatalogIngredientsForPicker(params, signal)
    );
  }

  const groupedItems = await Promise.all(
    recipeWaterAddFlowDefaultGroups.map((defaultGroup) => {
      const params = buildIngredientSearchParams({
        ...base,
        group: defaultGroup,
        limit: 100
      });
      return fetchRecipeCatalogIngredientsForPicker(params, signal);
    })
  );

  return filterRecipeWaterAddFlowSuggestions(groupedItems.flat());
};
