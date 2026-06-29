"use client";

import { beerStyleFixtures, convertVolume, convertWeight, evaluateStyleFit, getBeerStyleById, getBjcpArticleHrefByStyleId, getBjcpStyleDisplayName, getStyleRangeById, searchBeerStyles, srmToEbc, type BrewingSaltId } from "@nb/brewing-core";
import {
  CircleCheck,
  CircleAlert,
  ChevronRight,
  Droplets,
  ExternalLink,
  FileText,
  FlaskConical,
  Globe,
  Hop,
  Loader2,
  Lock,
  Package,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  Target,
  Thermometer,
  Timer,
  Trash2,
  Wheat,
  X
} from "lucide-react";
import React, { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import {
  createRecipeCustomIngredientAction,
  createRecipeAction,
  createRecipeVersionAction,
  createBrewBatchFromRecipeAction,
  consumeRecipeInventoryAction,
  exportRecipeBeerXmlAction,
  getRecipeStockCoverageAction,
  importBeerXmlRecipeAction,
  importBrewfatherJsonRecipeAction,
  previewRecipeDraftAction,
  proposeRecipeIngredientAction,
  releaseRecipeInventoryAction,
  reserveRecipeInventoryAction,
  syncRecipeInventoryAllocationsAction,
  updateRecipeAction,
  type RecipeEditorPayload,
  type RecipeEditorResult,
  type RecipeInventoryActionResult
} from "@/app/(app)/app/recipes/actions";
import {
  buildIngredientSearchParams,
  IngredientPicker,
  IngredientSelectionCard
} from "@/components/ingredients/ingredient-picker";
import { CustomIngredientForm, type CustomIngredientSubmitPayload } from "@/components/inventory/custom-ingredient-form";
import {
  buildRecipeIngredientTechnicalBadges,
  RecipeIngredientTechnicalBadges,
  RecipeIngredientTitleBlock,
  type RecipeIngredientCardSource
} from "@/components/recipes/recipe-ingredient-card-display";
import {
  InventoryIngredientContextSummary,
  resolveInventoryIngredientContextCategoryLabel,
  resolveInventoryIngredientContextSummary
} from "@/components/inventory/inventory-ingredient-context-summary";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import {
  type EquipmentProfileDto,
  type EquipmentProfileSnapshot
} from "@/features/equipment-profiles/contracts";
import { calculateEquipmentVolumePlan } from "@/features/equipment-profiles/volume-plan";
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
  buildIngredientPickerQuickStartGroupsFromRecentSelections,
  canonicalizeFermentableQuickStartGroup,
  ingredientPickerQuickStartRecentStorageKey,
  resolveFermentableQuickStartGroupLabel,
  sanitizeIngredientPickerStoredRecentSelections,
  type IngredientPickerStoredRecentSelection
} from "@/features/ingredients/picker-quick-start";
import {
  consumableInventoryAdditiveGroups,
  resolveConsumableInventoryBroadGroupLabel
} from "@/features/ingredients/consumables";
import {
  resolveIngredientDisplayNames
} from "@/features/ingredients/presentation";
import { resolveIngredientCategory, resolveLegacyIngredientType } from "@/features/ingredients/taxonomy";
import {
  formatInventoryQuantityInputValue,
  resolveInventoryMeasurementForDisplay
} from "@/features/inventory/display";
import { resolveWaterTreatmentFormulaLabel } from "@/features/ingredients/water-treatment";
import {
  getInventoryUnitInputStep,
  inventoryUnitLabels,
  resolveHumanFacingInventoryUnitProfile,
  type InventoryUnit,
  type InventoryUnitDimension
} from "@/features/inventory/units";
import {
  createRecipePayloadSchema,
  defaultRecipeProcessMeta,
  recipeBitternessFormulaLabels,
  recipeBitternessFormulas,
  recipeFermentableUseTypes,
  recipeHopUseTypes,
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
  type RecipeStockCoverageDto,
  type RecipeWaterManualSaltAdditionTarget,
  type RecipeWaterPlanMeta
} from "@/features/recipes/contracts";
import { beerColorFromSrm } from "@/features/recipes/beer-color";
import { formatBrixFromSg, formatColorWithEbc, formatGravityWithPlato, formatPlatoFromSg } from "@/features/recipes/format";
import { BeerGlassIcon } from "@/components/recipes/beer-glass-icon";
import { BitternessSettingsDrawer } from "@/components/recipes/bitterness-settings-drawer";
import { ImportExportModal, type ImportExportActionResult } from "@/components/recipes/import-export-modal";
import { IngredientAddDrawer } from "@/components/recipes/ingredient-add-drawer";
import { RecipeActionsMenu } from "@/components/recipes/recipe-actions-menu";
import { RecipeImagesSection } from "@/components/recipes/recipe-images-section";
import { StartBrewModal, type StartBrewResult } from "@/components/recipes/start-brew-modal";
import { BrewOnDeviceModal } from "@/features/brew-batches/components/brew-on-device-modal";
import {
  getRecipeWaterSetupToggleLabel,
  RecipeWaterAdditivesSection
} from "@/components/recipes/recipe-water-additives-section";
import { StockCoverageSummary } from "@/components/recipes/stock-coverage-summary";
import { StockIngredientList } from "@/components/recipes/stock-ingredient-list";
import {
  createRecipeWaterPlanResetMeta,
  removeRecipeWaterManualSaltAddition,
  setRecipeWaterSaltCalculationMode,
  WaterSetupWizard
} from "@/components/recipes/water-setup-wizard";
import {
  buildRecipePublicationChecklist,
  getRecipePublicationFieldErrors
} from "@/features/recipes/publication-validation";
import {
  resolveRecipeFgHelperText,
  resolveRecipeFgSourceLabel
} from "@/features/recipes/fg-estimate";
import type { RecipeImageDto } from "@/features/recipe-images/contracts";
import { globalBrewingRanges } from "@/features/recipes/style-ranges";
import {
  buildRecipeWaterPlanResult,
  type RecipeWaterPlanFermentableInput,
  type RecipeWaterPlanResult
} from "@/features/recipes/water-plan";
import {
  recipeWaterAddFlowCatalogIds,
  recipeWaterManualSaltIds,
  resolveRecipeWaterSaltIdFromCatalogId
} from "@/features/recipes/water-additives-catalog";
import { validateNumericInput } from "@/features/forms/numeric-validation";

type Props = {
  mode: "create" | "edit";
  initialRecipe?: RecipeDetailDto;
  initialTitle?: string;
  initialIngredientSelection?: IngredientSuggestionItem | null;
  initialStockCoverage?: RecipeStockCoverageDto | null;
  initialImages?: RecipeImageDto[];
  equipmentProfiles?: EquipmentProfileDto[];
  onSaveStatusChange?: (status: RecipeSaveStatus) => void;
  onRecipeCreated?: (recipe: RecipeDetailDto) => void;
  onPublicationStateChange?: (state: RecipePublicationState) => void;
};

export type RecipeSaveStatus = "saved" | "saving" | "error";

export const buildRecipeEditHref = (recipeId: string) => `/app/recipes/${recipeId}/edit`;

export const buildRecipeWizardResumeHref = (recipeId: string) => `/app/recipes/new?recipeId=${encodeURIComponent(recipeId)}`;

export const buildRecipeEditorResumeHref = (recipeId: string, currentPath: string) => (
  currentPath === "/app/recipes/new"
    ? buildRecipeWizardResumeHref(recipeId)
    : buildRecipeEditHref(recipeId)
);

const replaceRecipeEditorUrl = (recipeId: string) => {
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

type RecipeIngredientEditorSourceMode = "use_stock" | "catalog" | "custom";

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

const recipeIngredientCategoryOptions: Array<{
  value: IngredientCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClassName: string;
}> = [
    { value: "fermentable", label: "Сбраживаемое", icon: Wheat, iconClassName: "text-amber-600" },
    { value: "hop", label: "Хмель", icon: Hop, iconClassName: "text-emerald-600" },
    { value: "yeast", label: "Дрожжи", icon: FlaskConical, iconClassName: "text-violet-600" },
    { value: "water_treatment", label: "Водоподготовка", icon: Droplets, iconClassName: "text-sky-600" },
    { value: "consumable", label: "Другие добавки", icon: Package, iconClassName: "text-zinc-500" }
  ];

export type RecipeFermentablePickerScope =
  | "malt"
  | "adjunct_grains"
  | "extracts_and_concentrates"
  | "sugars_and_syrups"
  | "fruits_and_vegetables";

const isRecipeFermentableGroupScope = (
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

const buildRecipeFermentableForcedGroup = (
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

const buildRecipeConsumableForcedGroup = (): IngredientConsumableGroupRefinement => ({
  type: "consumable_group",
  label: resolveConsumableInventoryBroadGroupLabel(recipeConsumableAdditiveGroup) ?? "Другие добавки",
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

const resolveRecipeIngredientEditorCategoryLabel = ({
  category
}: {
  category?: IngredientCategory | null;
}) => {
  if (category === "fermentable") {
    return "Сбраживаемое";
  }

  return resolveInventoryIngredientContextCategoryLabel({ category });
};

const resolveRecipeFermentablePickerScopeFromIngredient = (
  ingredient: DesignerIngredient
): RecipeFermentablePickerScope | null => {
  if (ingredient.category !== "fermentable") {
    return null;
  }

  return ingredient.subtype === "malt" ? "malt" : null;
};

function RecipeIngredientCategoryGrid({
  value,
  onChange,
  legend = "Категория ингредиента",
  testId
}: {
  value: IngredientCategory;
  onChange: (value: IngredientCategory) => void;
  legend?: string;
  testId?: string;
}) {
  return (
    <fieldset className="space-y-2" data-testid={testId}>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {recipeIngredientCategoryOptions.map((option) => {
          const Icon = option.icon;

          return (
            <button
              key={option.value}
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                onChange(option.value);
              }}
              onClick={(event) => {
                if (event.detail !== 0) {
                  return;
                }

                onChange(option.value);
              }}
              className={`rounded-md border px-3 py-2 text-xs transition ${value === option.value
                ? "border-black bg-zinc-100 text-zinc-950"
                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
                }`}
            >
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${value === option.value ? "text-current" : option.iconClassName}`} />
                <span>{option.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function RecipeFermentableScopePicker({
  value,
  onChange
}: {
  value: RecipeFermentablePickerScope | null;
  onChange: (value: RecipeFermentablePickerScope | null) => void;
}) {
  const [recentSelections, setRecentSelections] = useState<IngredientPickerStoredRecentSelection[]>([]);
  const options = useMemo<Array<{ value: RecipeFermentablePickerScope; label: string }>>(() => {
    const orderedGroups: Array<{
      value: Exclude<RecipeFermentablePickerScope, "malt">;
      label: string;
    }> = buildIngredientPickerQuickStartGroupsFromRecentSelections({
      selections: recentSelections,
      category: "fermentable",
      subtype: "fermentable"
    })
      .flatMap((group) => (
        isRecipeFermentableGroupScope(group.value)
          ? [{
            value: group.value,
            label: group.label
          }]
          : []
      ));

    return [
      { value: "malt", label: "Солод" },
      ...orderedGroups
    ];
  }, [recentSelections]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(ingredientPickerQuickStartRecentStorageKey);
      if (!raw) {
        setRecentSelections([]);
        return;
      }

      setRecentSelections(sanitizeIngredientPickerStoredRecentSelections(JSON.parse(raw)));
    } catch {
      setRecentSelections([]);
    }
  }, []);

  return (
    <div className="space-y-2" data-testid="recipe-fermentable-scope-picker">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
        По типу сбраживаемого
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(active ? null : option.value)}
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active
                ? "border-zinc-950 bg-zinc-950 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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

type DesignerIngredient = {
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

type OpenEditorState = {
  localId: string | null;
  category: IngredientCategory;
  draft: DesignerIngredient;
  initialSignature: string;
  isExisting: boolean;
};

const hopUseTypeLabels: Record<RecipeHopUseType, string> = {
  boil: "Кипячение",
  first_wort_hop: "First Wort Hop",
  whirlpool: "Whirlpool / Hopstand",
  dry_hop: "Сухое охмеление",
  dip_hop: "Dip Hopping",
  other: "Другое"
};

const hopUseTypeSectionLabels: Record<RecipeHopUseType, string> = {
  ...hopUseTypeLabels,
  boil: "Добавление на кипячение"
};

const recipeHopUseTypeUiOrder: RecipeHopUseType[] = [
  "boil",
  "dry_hop",
  "whirlpool",
  "dip_hop",
  "first_wort_hop",
  "other"
];

const recipeAdditionalHopUseTypeUiOrder = recipeHopUseTypeUiOrder.filter((useType) => useType !== "boil");

const stageLabels: Record<DesignerIngredient["stage"], string> = {
  mash: "Затор",
  boil: "Кипячение",
  whirlpool: "Вирпул",
  fermentation: "Брожение",
  packaging: "Розлив",
  other: "Другое"
};

const recipeConsumableStageFallbackOrder: RecipeIngredientStage[] = [
  "mash",
  "boil",
  "whirlpool",
  "fermentation",
  "packaging",
  "other"
];

const normalizeRecipeConsumableUsageStageKey = (value?: string | null) => (
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

const fermentableUseLabels: Record<(typeof recipeFermentableUseTypes)[number], string> = {
  mash: "Затор",
  steep: "Настой",
  boil: "Кипячение"
};

const createLocalId = () => (
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) => (
      (Number(char) ^ Math.random() * 16 >> Number(char) / 4).toString(16)
    ))
);

const DEFAULT_BATCH_SIZE_ENTERED_QUANTITY = 20;
const DEFAULT_BATCH_SIZE_ENTERED_UNIT: InventoryUnit = "l";
const DEFAULT_BOIL_TIME_MINUTES = 60;
const DEFAULT_EFFICIENCY = 75;

const cloneRecipeProcessMeta = (value: RecipeProcessMeta = defaultRecipeProcessMeta): RecipeProcessMeta => ({
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

const cloneRecipeCalculationMeta = (value?: RecipeCalculationMeta | null): RecipeCalculationMeta => ({
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

const cloneRecipeWaterPlanMeta = (value?: RecipeWaterPlanMeta | null): RecipeWaterPlanMeta => ({
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

const cloneEquipmentProfileSnapshot = (value?: EquipmentProfileSnapshot | null): EquipmentProfileSnapshot | null => (
  value ? {
    ...value,
    maxMashVolumeL: value.maxMashVolumeL ?? null,
    maxKettleVolumeL: value.maxKettleVolumeL ?? null,
    notes: value.notes ?? null
  } : null
);

const buildEquipmentProfileSnapshotFromDto = (profile: EquipmentProfileDto): EquipmentProfileSnapshot => ({
  id: profile.id,
  name: profile.name,
  targetBatchVolumeL: profile.targetBatchVolumeL,
  brewhouseEfficiencyPct: profile.brewhouseEfficiencyPct,
  evaporationRateLPerHr: profile.evaporationRateLPerHr,
  trubChillerLossL: profile.trubChillerLossL,
  fermenterLossL: profile.fermenterLossL,
  grainAbsorptionLPerKg: profile.grainAbsorptionLPerKg,
  coolingShrinkagePct: profile.coolingShrinkagePct,
  mashThicknessLPerKg: profile.mashThicknessLPerKg,
  maxMashVolumeL: profile.maxMashVolumeL,
  maxKettleVolumeL: profile.maxKettleVolumeL,
  hopUtilizationFactor: profile.hopUtilizationFactor,
  altitudeM: profile.altitudeM,
  notes: profile.notes,
  snapshotAt: new Date().toISOString()
});

const formatEquipmentProfileRecipeValue = (value: number) => {
  const rounded = Number(value.toFixed(2));
  return Number.isInteger(rounded) ? String(Math.trunc(rounded)) : String(rounded);
};

const formatEquipmentProfilePercentValue = (value: number) => `${formatEquipmentProfileRecipeValue(value)}%`;
const formatEquipmentProfileLitersValue = (value: number) => `${formatEquipmentProfileRecipeValue(value)} л`;

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(media.matches);
    sync();

    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return isMobile;
};

const toInputString = (value: number | null | undefined) => (
  value == null ? "" : String(value)
);

const toOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
};

const normalizeSavePayload = (payload: RecipeEditorPayload): RecipeEditorPayload => ({
  ...payload,
  batchSizeEnteredUnit: payload.batchSizeEnteredUnit || DEFAULT_BATCH_SIZE_ENTERED_UNIT
});

const mapFieldErrorsFromIssues = (
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

const buildAutosaveBlockedResult = (
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
    styleId: payload.styleId ?? null,
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

const normalizeEditorPublicationState = (state: RecipePublicationState | null | undefined): RecipePublicationState => (
  state === "published" ? "published" : "private"
);

const mapHopStageFromUseType = (useType: RecipeHopUseType): DesignerIngredient["stage"] => {
  if (useType === "boil" || useType === "first_wort_hop") return "boil";
  if (useType === "whirlpool") return "whirlpool";
  if (useType === "dry_hop") return "fermentation";
  return "other";
};

const resolveRecipeFermentableSubtype = (
  category: IngredientCategory,
  subtype?: IngredientSubtype | null
): Extract<IngredientSubtype, "malt" | "fermentable"> | null => (
  category === "fermentable" && (subtype === "malt" || subtype === "fermentable")
    ? subtype
    : null
);

const createEmptyIngredient = (
  category: IngredientCategory,
  hopUseType: RecipeHopUseType = "boil",
  subtype: Extract<IngredientSubtype, "malt" | "fermentable"> | null = null
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
      timeOffset: "",
      stepMeta: {
        useType: hopUseType,
        timeMinutes: hopUseType === "boil" || hopUseType === "first_wort_hop" || hopUseType === "whirlpool" || hopUseType === "dip_hop" ? "" : undefined,
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
    stage: category === "yeast" ? "fermentation" : "other",
    timeOffset: "",
    stepMeta: {},
    inventoryIntentMode: "use_stock",
    inventorySelectionMeta: null,
    externalImportMeta: null
  };
};

const applySelection = (current: DesignerIngredient, item: IngredientSuggestionItem): DesignerIngredient => {
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

const applyQueryChange = (current: DesignerIngredient, nextValue: string): DesignerIngredient => {
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

const clearRecipeIngredientSelection = (current: DesignerIngredient): DesignerIngredient => {
  const cleared = applyQueryChange(current, "");

  return {
    ...cleared,
    inventoryIntentMode: current.inventoryIntentMode === "custom" ? "custom" : cleared.inventoryIntentMode,
    inventorySelectionMeta: null
  };
};

const applyRecipeIngredientCategoryContextChange = (
  current: DesignerIngredient,
  nextCategory: IngredientCategory,
  nextSubtype: Extract<IngredientSubtype, "malt" | "fermentable"> | null = null
): DesignerIngredient => {
  const normalizedNextSubtype = resolveRecipeFermentableSubtype(nextCategory, nextSubtype);

  if (current.category === nextCategory && current.subtype === normalizedNextSubtype) {
    return current;
  }

  const nextDraft = createEmptyIngredient(
    nextCategory,
    nextCategory === "hop" ? getHopUseType(current) : "boil",
    normalizedNextSubtype
  );

  return {
    ...nextDraft,
    localId: current.localId,
    persistentKey: current.persistentKey,
    inventoryIntentMode: resolveRecipeIngredientEditorSourceMode(current.inventoryIntentMode),
    inventorySelectionMeta: null
  };
};

const readInventorySelectionMetaString = (
  meta: RecipeInventorySelectionMeta | null,
  key: string
) => {
  const value = meta?.[key];
  return typeof value === "string" && value.trim() ? value : null;
};

const readInventorySelectionMetaNumber = (
  meta: RecipeInventorySelectionMeta | null,
  key: string
) => {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const buildSelectedIngredientPreview = (ingredient: DesignerIngredient): IngredientSuggestionItem | null => {
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

const serializeIngredient = (ingredient: DesignerIngredient) => JSON.stringify(ingredient);

const getHopUseType = (ingredient: DesignerIngredient) => ingredient.stepMeta.useType ?? (
  ingredient.stage === "boil"
    ? "boil"
    : ingredient.stage === "whirlpool"
      ? "whirlpool"
      : ingredient.stage === "fermentation"
        ? "dry_hop"
        : "other"
);

const buildIngredientPayload = (ingredient: DesignerIngredient): RecipeEditorPayload["ingredients"][number] => {
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

const toDesignerIngredient = (ingredient: RecipeDetailDto["ingredients"][number]): DesignerIngredient => {
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

const buildInitialPreview = (recipe?: RecipeDetailDto): RecipeDraftPreviewDto | null => {
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

const buildEditorPayloadFromRecipe = (
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

const buildSummaryDetails = (ingredient: DesignerIngredient) => {
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

const getQuantityText = (ingredient: DesignerIngredient) => `${ingredient.amountEnteredQuantity || "—"} ${inventoryUnitLabels[ingredient.amountEnteredUnit] ?? ingredient.amountEnteredUnit}`;

const buildDesignerIngredientCardSource = (ingredient: DesignerIngredient): RecipeIngredientCardSource => ({
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

const getSectionTitle = (category: IngredientCategory) => {
  if (category === "fermentable") return "Сбраживаемое";
  if (category === "hop") return "Хмель";
  if (category === "yeast") return "Дрожжи";
  if (category === "water_treatment") return "Водоподготовка";
  return "Другие добавки";
};

const categoryIcons: Record<IngredientCategory, React.ComponentType<{ className?: string }>> = {
  fermentable: Wheat,
  hop: Hop,
  yeast: FlaskConical,
  water_treatment: Droplets,
  consumable: Package
};

const categoryAccentBorder: Record<IngredientCategory, string> = {
  fermentable: "border-l-amber-400",
  hop: "border-l-emerald-500",
  yeast: "border-l-violet-400",
  water_treatment: "border-l-sky-400",
  consumable: "border-l-zinc-300"
};

const categoryIconBg: Record<IngredientCategory, string> = {
  fermentable: "bg-amber-50 text-amber-600",
  hop: "bg-emerald-50 text-emerald-600",
  yeast: "bg-violet-50 text-violet-600",
  water_treatment: "bg-sky-50 text-sky-600",
  consumable: "bg-zinc-100 text-zinc-500"
};

const getCategoryRows = (ingredients: DesignerIngredient[], category: IngredientCategory) => ingredients.filter((ingredient) => ingredient.category === category);

const getFermentableWeightTotalKg = (ingredients: DesignerIngredient[]) => {
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

const getBatchVolumeLiters = (quantityInput: string, unit: InventoryUnit): number | null => {
  const quantity = Number(quantityInput);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (!["ml", "l", "gal"].includes(unit)) return null;
  return convertVolume({ value: quantity, unit: unit as "ml" | "l" | "gal" }, "l").value;
};

const getIngredientWeightKg = (ingredient: DesignerIngredient): number => {
  const quantity = Number(ingredient.amountEnteredQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  if (!["g", "kg", "oz", "lb"].includes(ingredient.amountEnteredUnit)) return 0;
  return convertWeight({ value: quantity, unit: ingredient.amountEnteredUnit as "g" | "kg" | "oz" | "lb" }, "kg").value;
};

const getFermentablesForWaterPlan = (ingredients: DesignerIngredient[]): RecipeWaterPlanFermentableInput[] => (
  ingredients
    .filter((ingredient) => ingredient.category === "fermentable")
    .map((ingredient) => ({
      name: ingredient.selectedName,
      subtype: ingredient.subtype,
      weightKg: getIngredientWeightKg(ingredient)
    }))
    .filter((ingredient) => ingredient.weightKg > 0)
);

const getFermentablePercentage = (ingredient: DesignerIngredient, totalKg: number): number | null => {
  if (totalKg <= 0) return null;
  const kg = getIngredientWeightKg(ingredient);
  if (kg <= 0) return null;
  return (kg / totalKg) * 100;
};

const getHopWeightTotalG = (ingredients: DesignerIngredient[]) => {
  return ingredients.reduce((sum, ingredient) => {
    const quantity = Number(ingredient.amountEnteredQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return sum;
    if (!["g", "kg", "oz", "lb"].includes(ingredient.amountEnteredUnit)) return sum;
    return sum + convertWeight({ value: quantity, unit: ingredient.amountEnteredUnit as "g" | "kg" | "oz" | "lb" }, "g").value;
  }, 0);
};

const getHopTimeMinutesValue = (ingredient: DesignerIngredient) => {
  const value = Number(ingredient.stepMeta.timeMinutes ?? "");
  return Number.isFinite(value) ? value : -1;
};

const isRecipeDesignerRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object"
  && value !== null
  && !Array.isArray(value)
);

const readImportedDesignerIngredientSnapshot = (ingredient: DesignerIngredient): RecipeImportedIngredientSnapshot | null => {
  const snapshot = ingredient.externalImportMeta?.importedIngredient;
  if (!isRecipeDesignerRecord(snapshot) || snapshot.version !== 1 || typeof snapshot.name !== "string") {
    return null;
  }

  return snapshot as unknown as RecipeImportedIngredientSnapshot;
};

const isImportedDesignerIngredient = (ingredient: DesignerIngredient) => (
  ingredient.inventoryIntentMode === "imported"
  && !ingredient.ingredientCatalogItemId
  && !ingredient.userCustomIngredientId
  && readImportedDesignerIngredientSnapshot(ingredient) != null
);

const isIngredientValid = (ingredient: DesignerIngredient) => {
  if (!ingredient.ingredientCatalogItemId && !ingredient.userCustomIngredientId && !isImportedDesignerIngredient(ingredient)) {
    return false;
  }

  const quantity = Number(ingredient.amountEnteredQuantity);
  return Number.isFinite(quantity) && quantity > 0;
};

const getIngredientDraftFieldError = (ingredient: DesignerIngredient) => {
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

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const getMetricPositionPercent = (value: number | null, min: number, max: number) => {
  if (value == null || max <= min) {
    return null;
  }

  return clampPercent(((value - min) / (max - min)) * 100);
};

const getMetricStatusAppearance = (status: "in_range" | "below" | "above" | "no_style" | null) => {
  if (status === "in_range") {
    return {
      label: "В стиле",
      badgeClassName: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
      needleClassName: "bg-emerald-500",
      needleDotClassName: "bg-emerald-500 ring-2 ring-white shadow"
    };
  }

  if (status === "below") {
    return {
      label: "Ниже",
      badgeClassName: "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200",
      needleClassName: "bg-zinc-400",
      needleDotClassName: "bg-zinc-500 ring-2 ring-white shadow"
    };
  }

  if (status === "above") {
    return {
      label: "Выше",
      badgeClassName: "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200",
      needleClassName: "bg-zinc-400",
      needleDotClassName: "bg-zinc-500 ring-2 ring-white shadow"
    };
  }

  if (status === "no_style") {
    return {
      label: "—",
      badgeClassName: "bg-sky-50 text-sky-500 ring-1 ring-sky-200",
      needleClassName: "bg-sky-400",
      needleDotClassName: "bg-sky-400 ring-2 ring-white shadow"
    };
  }

  return {
    label: "—",
    badgeClassName: "bg-zinc-50 text-zinc-500 ring-1 ring-zinc-200",
    needleClassName: "bg-zinc-400",
    needleDotClassName: "bg-zinc-400 ring-2 ring-white shadow"
  };
};

function StylePicker({
  value,
  onChange,
  className,
  id = "recipe-style"
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  id?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const labelId = `${id}-label`;
  const selectedStyle = useMemo(
    () => getBeerStyleById(value),
    [value]
  );
  const filteredStyles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return beerStyleFixtures;
    }

    return searchBeerStyles(normalized);
  }, [query]);

  const updateDropdownPosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 8,
      left: rect.left,
      width: Math.min(420, window.innerWidth - 32),
      zIndex: 9999,
    });
  };

  useEffect(() => {
    if (!open) return;

    updateDropdownPosition();
    searchInputRef.current?.focus({ preventScroll: true });

    const handlePointerDown = (event: MouseEvent) => {
      if (
        !containerRef.current?.contains(event.target as Node) &&
        !(event.target as Element)?.closest(`[data-style-picker-dropdown="${id}"]`)
      ) {
        setOpen(false);
      }
    };

    const handleScroll = () => updateDropdownPosition();

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [open, id]);

  const dropdown = open ? (
    <div
      data-style-picker-dropdown={id}
      style={dropdownStyle}
      className="rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl"
    >
      <input
        ref={searchInputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Найти стиль по коду, семейству или названию"
        className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900"
      />
      <div className="mt-2 max-h-80 overflow-y-auto">
        <button
          type="button"
          onClick={() => {
            onChange("");
            setQuery("");
            setOpen(false);
          }}
          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-zinc-50 ${!selectedStyle ? "bg-zinc-50 text-zinc-900" : "text-zinc-700"}`}
        >
          <span>Пиво вне BJCP стиля</span>
          {!selectedStyle ? <span className="text-[11px] text-zinc-500">активно</span> : null}
        </button>

        {filteredStyles.length ? (
          filteredStyles.map((style) => {
            const styleCode = style.styleKey ?? style.bjcpId;
            const styleFamily = style.familyRu ?? style.family;
            const subtitle = [styleCode, style.name, styleFamily].filter(Boolean).join(" • ");

            return (
              <button
                key={style.id}
                type="button"
                onClick={() => {
                  onChange(style.id);
                  setQuery("");
                  setOpen(false);
                }}
                className={`mt-1 flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-zinc-50 ${value === style.id ? "bg-zinc-50" : ""}`}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-zinc-900">{getBjcpStyleDisplayName(style)}</div>
                  <div className="text-xs text-zinc-500">
                    {subtitle}
                  </div>
                </div>
                {value === style.id ? <span className="text-[11px] text-zinc-500">выбран</span> : null}
              </button>
            );
          })
        ) : (
          <div className="px-3 py-4 text-sm text-zinc-500">Ничего не найдено.</div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={`relative ${className ?? "min-w-[280px] shrink-0"}`}>
      <label id={labelId} htmlFor={id} className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        Стиль BJCP
      </label>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-labelledby={`${labelId} ${id}`}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 text-left text-sm text-zinc-900 shadow-sm"
      >
        <span className={`truncate ${selectedStyle ? "text-zinc-900" : "text-zinc-500"}`}>
          {selectedStyle ? getBjcpStyleDisplayName(selectedStyle) : "Выбрать стиль"}
        </span>
        <span className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-zinc-400">
          {selectedStyle?.bjcpId ?? "BJCP"}
        </span>
      </button>

      {typeof window !== "undefined" ? createPortal(dropdown, document.body) : null}
    </div>
  );
}

function StyleRangeTrack({
  actualValue,
  globalRange,
  styleRange,
  status,
  valueLabel,
  hasStyle,
  missingStyleRange
}: {
  actualValue: number | null;
  globalRange: { min: number; max: number };
  styleRange: { min: number; max: number } | null;
  status: "in_range" | "below" | "above" | null;
  valueLabel: string;
  hasStyle: boolean;
  missingStyleRange: boolean;
}) {
  const appearance = hasStyle && !missingStyleRange ? getMetricStatusAppearance(status) : getMetricStatusAppearance("no_style");
  const valuePercent = getMetricPositionPercent(actualValue, globalRange.min, globalRange.max);

  const bandLeft = styleRange ? clampPercent(((styleRange.min - globalRange.min) / (globalRange.max - globalRange.min)) * 100) : null;
  const bandRight = styleRange ? clampPercent(((styleRange.max - globalRange.min) / (globalRange.max - globalRange.min)) * 100) : null;
  const bandWidth = bandLeft != null && bandRight != null ? bandRight - bandLeft : null;

  if (valuePercent == null && bandLeft == null) {
    return (
      <div className="flex h-5 items-center text-[11px] text-zinc-400">
        {missingStyleRange ? "Не указано в BJCP" : "Нет данных"}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <div className="relative h-6 w-full rounded-md bg-zinc-100">
        {bandLeft != null && bandWidth != null && (
          <div
            className="absolute inset-y-0 rounded-md bg-emerald-500/[.12] ring-1 ring-inset ring-emerald-500/20"
            style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
          />
        )}
        {valuePercent != null && (
          <>
            <div
              className={`absolute top-0 h-full w-[2px] -translate-x-[1px] ${appearance.needleClassName}`}
              style={{ left: `${valuePercent}%` }}
            />
            <div
              className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${appearance.needleDotClassName}`}
              style={{ left: `${valuePercent}%` }}
            />
          </>
        )}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums text-zinc-700">
          {valueLabel}
        </span>
      </div>
      {missingStyleRange ? (
        <div className="text-[9px] font-medium leading-tight text-zinc-500">Диапазон не указан в BJCP</div>
      ) : null}
    </div>
  );
}

const formatGravityPlato = (sg: number | null) => {
  if (sg == null) return "—";
  return formatPlatoFromSg(sg, 1);
};

const getRangeStatus = (
  actualValue: number | null,
  styleRange: { min: number; max: number } | null
): "in_range" | "below" | "above" | null => {
  if (actualValue == null || !styleRange) {
    return null;
  }
  if (actualValue < styleRange.min) {
    return "below";
  }
  if (actualValue > styleRange.max) {
    return "above";
  }
  return "in_range";
};

function RecipeStyleStatsBlock({
  preview,
  recalculating,
  previewError
}: {
  preview: RecipeDraftPreviewDto | null;
  recalculating: boolean;
  previewError: string | null;
}) {
  const selectedStyle = getBeerStyleById(preview?.styleId);
  const hasCalculatedMetrics = [preview?.og, preview?.fg, preview?.abv, preview?.ibu, preview?.color].some((value) => value != null);
  const hasSelectedStyle = Boolean(selectedStyle);
  const hasAnyStyleMetric = Boolean(selectedStyle && [selectedStyle.og, selectedStyle.fg, selectedStyle.abv, selectedStyle.ibu, selectedStyle.colorSrm].some((value) => value != null));
  const styleName = selectedStyle ? getBjcpStyleDisplayName(selectedStyle) : null;
  const selectedStyleArticleHref = getBjcpArticleHrefByStyleId(preview?.styleId);

  const items = [
    {
      label: "НП",
      valueLabel: preview?.og != null ? `${preview.og.toFixed(3)} · ${formatGravityPlato(preview.og)}` : "—",
      actualValue: preview?.og ?? null,
      globalRange: globalBrewingRanges.og,
      styleRange: selectedStyle?.og ?? null,
      globalMinLabel: globalBrewingRanges.og.min.toFixed(3),
      globalMaxLabel: globalBrewingRanges.og.max.toFixed(3),
      status: getRangeStatus(preview?.og ?? null, selectedStyle?.og ?? null)
    },
    {
      label: "КП",
      valueLabel: preview?.fg != null ? `${preview.fg.toFixed(3)} · ${formatGravityPlato(preview.fg)}` : "—",
      actualValue: preview?.fg ?? null,
      globalRange: globalBrewingRanges.fg,
      styleRange: selectedStyle?.fg ?? null,
      globalMinLabel: globalBrewingRanges.fg.min.toFixed(3),
      globalMaxLabel: globalBrewingRanges.fg.max.toFixed(3),
      status: getRangeStatus(preview?.fg ?? null, selectedStyle?.fg ?? null)
    },
    {
      label: "ABV",
      valueLabel: preview?.abv != null ? `${preview.abv.toFixed(1)}%` : "—",
      actualValue: preview?.abv ?? null,
      globalRange: globalBrewingRanges.abv,
      styleRange: selectedStyle?.abv ?? null,
      globalMinLabel: `${globalBrewingRanges.abv.min.toFixed(0)}%`,
      globalMaxLabel: `${globalBrewingRanges.abv.max.toFixed(0)}%`,
      status: getRangeStatus(preview?.abv ?? null, selectedStyle?.abv ?? null)
    },
    {
      label: "IBU",
      valueLabel: preview?.ibu != null ? `${preview.ibu.toFixed(0)}` : "—",
      actualValue: preview?.ibu ?? null,
      globalRange: globalBrewingRanges.ibu,
      styleRange: selectedStyle?.ibu ?? null,
      globalMinLabel: `${globalBrewingRanges.ibu.min.toFixed(0)}`,
      globalMaxLabel: `${globalBrewingRanges.ibu.max.toFixed(0)}`,
      status: getRangeStatus(preview?.ibu ?? null, selectedStyle?.ibu ?? null)
    },
    {
      label: "Color",
      valueLabel: preview?.color != null ? formatColorWithEbc(preview.color) : "—",
      actualValue: preview?.color ?? null,
      globalRange: globalBrewingRanges.colorSrm,
      styleRange: selectedStyle?.colorSrm ?? null,
      globalMinLabel: `${globalBrewingRanges.colorSrm.min.toFixed(0)}`,
      globalMaxLabel: `${globalBrewingRanges.colorSrm.max.toFixed(0)}`,
      status: getRangeStatus(preview?.color ?? null, selectedStyle?.colorSrm ?? null)
    }
  ];

  const comparableItems = items.filter((item) => item.actualValue != null && item.styleRange);
  const overallFit = comparableItems.length > 0 &&
    comparableItems.every((item) => item.status === "in_range");

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-[0_1px_3px_0_rgb(0_0_0_/_0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50/40 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-semibold text-zinc-700">
            {styleName && selectedStyleArticleHref ? (
              <>
                <span>Ваш рецепт и </span>
                <a
                  href={selectedStyleArticleHref}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Открыть описание BJCP стиля ${selectedStyle?.name ?? styleName}`}
                  className="inline-flex min-w-0 items-center gap-1.5 rounded-md underline-offset-2 transition-colors hover:text-zinc-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                >
                  <span className="truncate">{`BJCP ${styleName}`}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                </a>
              </>
            ) : styleName ? `Ваш рецепт и BJCP ${styleName}` : "Расчёт показателей"}
          </h2>
          {comparableItems.length > 0 ? (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${overallFit ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" : "bg-zinc-100 text-zinc-600 ring-1 ring-inset ring-zinc-200"}`}>
              {overallFit ? <CircleCheck className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}
              {overallFit ? "В стиле" : "Отклонения"}
            </span>
          ) : null}
          {hasSelectedStyle && hasCalculatedMetrics && !hasAnyStyleMetric ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200">
              <CircleAlert className="h-3 w-3" />
              Диапазоны BJCP не указаны
            </span>
          ) : null}
          {recalculating ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Пересчёт…
            </span>
          ) : null}
        </div>
        {previewError ? <p className="text-xs text-rose-500">{previewError}</p> : null}
      </div>

      <div className="flex-1 px-3 py-3">
        {items.map((item) => {
          const missingStyleRange = hasSelectedStyle && !item.styleRange;
          const appearance = hasSelectedStyle && !missingStyleRange ? getMetricStatusAppearance(item.status) : getMetricStatusAppearance("no_style");

          return (
            <div key={item.label} className="group grid items-center gap-x-2 rounded-lg px-1 py-1 transition-colors hover:bg-zinc-50 sm:grid-cols-[46px_minmax(0,1fr)_60px]">
              <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                <span>{item.label}</span>
              </div>
              <div>
                <StyleRangeTrack
                  actualValue={item.actualValue}
                  globalRange={item.globalRange}
                  styleRange={item.styleRange}
                  status={item.status}
                  valueLabel={item.valueLabel}
                  hasStyle={hasSelectedStyle}
                  missingStyleRange={missingStyleRange}
                />
                <div className="flex justify-between text-[9px] tabular-nums text-zinc-400">
                  <span>{item.globalMinLabel}</span>
                  <span>{item.globalMaxLabel}</span>
                </div>
              </div>
              <div className="flex justify-end">
                <span className={`inline-flex w-[60px] justify-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${appearance.badgeClassName}`}>
                  {appearance.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const formatSignedPctPoints = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)} п.п.`;

function FgSettingsPopover({
  preview,
  calculationMeta,
  onChange
}: {
  preview: RecipeDraftPreviewDto | null;
  calculationMeta: RecipeCalculationMeta;
  onChange: React.Dispatch<React.SetStateAction<RecipeCalculationMeta>>;
}) {
  const [open, setOpen] = useState(false);
  const [manualFgEnabled, setManualFgEnabled] = useState(Boolean(calculationMeta.manualFgOverrideValue != null));
  const [manualAttenuationInput, setManualAttenuationInput] = useState(
    toInputString(calculationMeta.manualAttenuationOverridePct ?? null)
  );
  const [manualFgInput, setManualFgInput] = useState(
    toInputString(calculationMeta.manualFgOverrideValue ?? null)
  );
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (calculationMeta.manualFgOverrideValue != null) {
      setManualFgEnabled(true);
    }
  }, [calculationMeta.manualFgOverrideValue]);

  useEffect(() => {
    setManualAttenuationInput(toInputString(calculationMeta.manualAttenuationOverridePct ?? null));
  }, [calculationMeta.manualAttenuationOverridePct]);

  useEffect(() => {
    setManualFgInput(toInputString(calculationMeta.manualFgOverrideValue ?? null));
  }, [calculationMeta.manualFgOverrideValue]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        (popoverRef.current && popoverRef.current.contains(target))
        || (triggerRef.current && triggerRef.current.contains(target))
      ) {
        return;
      }

      closePopover();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePopover();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [manualFgEnabled, open, manualAttenuationInput, manualFgInput]);

  const commitManualAttenuation = () => {
    const parsed = toOptionalNumber(manualAttenuationInput);
    const nextValue = parsed == null || !Number.isFinite(parsed)
      ? null
      : clampNumber(parsed, 60, 90);

    setManualAttenuationInput(toInputString(nextValue));
    onChange((current) => ({
      ...current,
      manualAttenuationOverridePct: nextValue
    }));
  };

  const commitManualFg = () => {
    const parsed = toOptionalNumber(manualFgInput);
    const nextValue = parsed == null || !Number.isFinite(parsed)
      ? null
      : clampNumber(parsed, 0.99, 1.2);

    setManualFgInput(toInputString(nextValue));
    onChange((current) => ({
      ...current,
      manualFgOverrideValue: nextValue
    }));
  };

  const closePopover = () => {
    commitManualAttenuation();
    if (manualFgEnabled) {
      commitManualFg();
    }
    setOpen(false);
  };
  const manualFgDisplayValue = manualFgEnabled
    ? toOptionalNumber(manualFgInput) ?? calculationMeta.manualFgOverrideValue ?? preview?.fg ?? null
    : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) {
            closePopover();
            return;
          }

          setOpen(true);
        }}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-[13px] leading-none transition-colors hover:bg-zinc-100 hover:text-zinc-700 ${open ? "bg-zinc-100 text-zinc-700" : "text-zinc-400"}`}
        aria-label="Открыть настройки КП"
      >
        ⚙
      </button>

      {open ? (
        <div
          ref={popoverRef}
          className="absolute right-0 top-9 z-20 w-[min(20rem,calc(100vw-2.5rem))] rounded-2xl border border-zinc-200 bg-white p-3 normal-case tracking-normal shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-zinc-900">Прогноз КП</h4>
            </div>
            <button
              type="button"
              onClick={closePopover}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm text-zinc-300 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Закрыть настройки КП"
            >
              ×
            </button>
          </div>

          <div className="mt-2.5 space-y-2.5">
            <label className="space-y-1 text-[11px] font-medium text-zinc-500">
              Ожидаемая attenuation, %
              <input
                type="number"
                min={60}
                max={90}
                step={0.1}
                disabled={manualFgEnabled}
                value={manualAttenuationInput}
                onChange={(event) => setManualAttenuationInput(event.target.value)}
                onBlur={commitManualAttenuation}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
                className={`h-9 w-full rounded-lg border px-2.5 text-sm tabular-nums shadow-sm ${manualFgEnabled
                  ? "border-zinc-100 bg-zinc-50 text-zinc-400"
                  : "border-zinc-200 bg-white text-zinc-900"
                  }`}
                placeholder="Например, 75"
              />
              <span className="block text-[11px] font-normal text-zinc-400">
                Пусто — использовать авторасчет
              </span>
            </label>

            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-[11px] font-medium text-zinc-600">
                <input
                  type="checkbox"
                  checked={manualFgEnabled}
                  onChange={(event) => {
                    const nextEnabled = event.target.checked;
                    setManualFgEnabled(nextEnabled);
                    if (nextEnabled) {
                      setManualFgInput(toInputString(calculationMeta.manualFgOverrideValue ?? preview?.fg ?? null));
                    } else {
                      setManualFgInput("");
                      onChange((current) => ({
                        ...current,
                        manualFgOverrideValue: null
                      }));
                    }
                  }}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Зафиксировать КП вручную
              </label>

              {manualFgEnabled ? (
                <div className="space-y-1">
                  <input
                    type="number"
                    min={0.99}
                    max={1.2}
                    step={0.001}
                    value={manualFgInput}
                    onChange={(event) => setManualFgInput(event.target.value)}
                    onBlur={commitManualFg}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums text-zinc-900 shadow-sm"
                    placeholder={preview?.fg != null ? preview.fg.toFixed(3) : "1.012"}
                  />
                  {manualFgDisplayValue != null ? (
                    <span className="block text-[11px] font-normal tabular-nums text-zinc-400">
                      {formatBrixFromSg(manualFgDisplayValue, 1)}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RecipeBatchParametersBlock({
  batchSize,
  setBatchSize,
  efficiency,
  setEfficiency,
  boilTimeMinutes,
  setBoilTimeMinutes,
  styleId,
  calculationMeta,
  setCalculationMeta,
  sectionErrors,
  preview,
  recalculating,
  previewError,
  equipmentProfiles,
  selectedEquipmentProfileId,
  onSelectEquipmentProfile,
  onOpenBitternessSettings
}: {
  batchSize: { quantity: string; unit: InventoryUnit };
  setBatchSize: React.Dispatch<React.SetStateAction<{ quantity: string; unit: InventoryUnit }>>;
  efficiency: string;
  setEfficiency: React.Dispatch<React.SetStateAction<string>>;
  boilTimeMinutes: string;
  setBoilTimeMinutes: React.Dispatch<React.SetStateAction<string>>;
  styleId: string | null;
  calculationMeta: RecipeCalculationMeta;
  setCalculationMeta: React.Dispatch<React.SetStateAction<RecipeCalculationMeta>>;
  sectionErrors: Record<string, string>;
  preview: RecipeDraftPreviewDto | null;
  recalculating: boolean;
  previewError: string | null;
  equipmentProfiles: EquipmentProfileDto[];
  selectedEquipmentProfileId: string | null;
  onSelectEquipmentProfile: (profileId: string | null) => void;
  onOpenBitternessSettings: () => void;
}) {
  const colorSrmValue = preview?.color != null ? preview.color.toFixed(1) : null;
  const colorEbcValue = preview?.color != null ? srmToEbc(preview.color).toFixed(0) : null;
  const colorInfo = preview?.color != null ? beerColorFromSrm(preview.color) : null;
  const selectedStyle = getBeerStyleById(styleId);
  const selectedEquipmentProfile = equipmentProfiles.find((profile) => profile.id === selectedEquipmentProfileId) ?? null;
  const equipmentProfileSelectValue = selectedEquipmentProfile?.id ?? "";
  const selectedEquipmentProfileLabel = selectedEquipmentProfile
    ? selectedEquipmentProfile.name
    : "Без профиля";
  const fgSourceLabel = resolveRecipeFgSourceLabel(preview?.fgEstimateMode, preview?.fgEstimateDetails);
  const fgHelperText = resolveRecipeFgHelperText(preview?.fgEstimateMode, preview?.fg);
  // Числа устарели, пока идёт пересчёт или превью упало с ошибкой — приглушаем,
  // чтобы не выдавать stale-значения за достоверные (#15).
  const metricsStale = recalculating || Boolean(previewError);

  const summaryItems = [
    {
      key: "color",
      label: "Цвет",
      value: colorSrmValue != null && colorEbcValue != null
        ? { srm: colorSrmValue, ebc: colorEbcValue }
        : null
    },
    { key: "og", label: "НП", value: formatGravityWithPlato(preview?.og ?? null) },
    {
      key: "fg",
      label: "КП",
      value: formatGravityWithPlato(preview?.fg ?? null),
      sourceLabel: preview?.fg != null ? fgSourceLabel : null,
      helperText: preview?.fg == null ? fgHelperText : null,
      settingsControl: (
        <FgSettingsPopover
          preview={preview}
          calculationMeta={calculationMeta}
          onChange={setCalculationMeta}
        />
      )
    },
    {
      key: "ibu",
      label: "IBU",
      value: preview?.ibu != null ? `${preview.ibu.toFixed(0)}` : "—",
      settingsControl: (
        <button
          type="button"
          onClick={onOpenBitternessSettings}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[13px] leading-none text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Открыть настройки расчета горечи"
        >
          ⚙
        </button>
      )
    },
    { key: "abv", label: "ABV", value: preview?.abv != null ? `${preview.abv.toFixed(1)}%` : "—" },
    { key: "style", label: "Стиль", value: selectedStyle?.name ?? "Вне BJCP" }
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-[0_1px_3px_0_rgb(0_0_0_/_0.04)]">
      <div className="border-b border-zinc-100 bg-zinc-50/40 px-4 py-3">
        <h3 className="text-sm font-semibold text-zinc-700">Параметры партии</h3>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <dl
          aria-busy={recalculating}
          className={`mb-4 grid grid-cols-2 gap-2 transition-opacity xl:grid-cols-3 ${metricsStale ? "opacity-50" : ""}`}
        >
          {summaryItems.map((item) => {
            const isColor = item.key === "color";
            const isStyle = item.key === "style";
            const isGravity = item.key === "og" || item.key === "fg";

            return (
              <div
                key={item.key}
                className="group relative min-w-0 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5"
              >
                <dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
                  <span className="truncate">{item.label}</span>
                  {"settingsControl" in item && item.settingsControl ? (
                    <span className="ml-auto shrink-0">{item.settingsControl}</span>
                  ) : null}
                </dt>
                {isColor && item.value && typeof item.value === "object" ? (
                  <dd className="mt-1 flex min-w-0 items-center gap-1.5">
                    {colorInfo ? (
                      <BeerGlassIcon color={colorInfo.hex} size={22} className="shrink-0 text-zinc-300" />
                    ) : null}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold tabular-nums text-zinc-950">
                        <span>{item.value.srm} <span className="text-xs font-medium text-zinc-500">SRM</span></span>
                        {" / "}
                        <span>{item.value.ebc} <span className="text-xs font-medium text-zinc-500">EBC</span></span>
                      </div>
                      {colorInfo ? (
                        <div className="truncate text-xs text-zinc-500">{colorInfo.label}</div>
                      ) : null}
                    </div>
                  </dd>
                ) : isStyle ? (
                  <dd className="mt-1 min-w-0" title={typeof item.value === "string" ? item.value : undefined}>
                    <div>
                      <div className="truncate text-sm font-semibold text-zinc-950">{typeof item.value === "string" ? item.value : "—"}</div>
                      {selectedStyle?.bjcpId && selectedStyle.bjcpId !== "LEGACY" ? (
                        <div className="truncate text-[11px] font-medium text-zinc-500">
                          BJCP {selectedStyle.bjcpId}
                        </div>
                      ) : null}
                    </div>
                  </dd>
                ) : isGravity ? (() => {
                  const strVal = typeof item.value === "string" ? item.value : "—";
                  const parts = strVal !== "—" ? strVal.match(/^([\d.]+)\s*\((.+)\)$/) : null;
                  return (
                    <dd className="mt-1 min-w-0">
                      {parts ? (
                        <div>
                          <div className="text-sm font-semibold tabular-nums text-zinc-950">{parts[1]}</div>
                          <div className="text-xs font-medium tabular-nums text-zinc-500">{parts[2]}</div>
                          {"sourceLabel" in item && item.sourceLabel ? (
                            <div className="mt-1 text-[11px] font-medium text-zinc-500">{item.sourceLabel}</div>
                          ) : null}
                          {"helperText" in item && item.helperText ? (
                            <div className="mt-1 text-[11px] text-zinc-400">{item.helperText}</div>
                          ) : null}
                        </div>
                      ) : (
                        <div>
                          <div className="text-sm font-semibold tabular-nums text-zinc-950">{strVal}</div>
                          {"sourceLabel" in item && item.sourceLabel ? (
                            <div className="mt-1 text-[11px] font-medium text-zinc-500">{item.sourceLabel}</div>
                          ) : null}
                          {"helperText" in item && item.helperText ? (
                            <div className="mt-1 text-[11px] text-zinc-400">{item.helperText}</div>
                          ) : null}
                        </div>
                      )}
                    </dd>
                  );
                })() : (
                  <dd className="mt-1">
                    <div className="text-base font-semibold tabular-nums text-zinc-950">
                      {typeof item.value === "string" ? item.value : "—"}
                    </div>
                    {"sourceLabel" in item && item.sourceLabel ? (
                      <div className="mt-1 text-[11px] font-medium text-zinc-500">{item.sourceLabel}</div>
                    ) : null}
                    {"helperText" in item && item.helperText ? (
                      <div className="mt-1 text-[11px] text-zinc-400">{item.helperText}</div>
                    ) : null}
                  </dd>
                )}
              </div>
            );
          })}
        </dl>

        <div className="mt-auto border-t border-zinc-100 pt-3">
          <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <label className="space-y-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Объём
              <div className="relative">
                <input type="number" min={0.1} max={10000} step={0.1} value={batchSize.quantity} onChange={(event) => setBatchSize((current) => ({ ...current, quantity: event.target.value }))} className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 pr-10 text-sm tabular-nums text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200" />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-zinc-400">
                  л
                </span>
              </div>
              {sectionErrors.batchSizeEnteredQuantity ? <span className="block text-xs normal-case tracking-normal text-rose-600">{sectionErrors.batchSizeEnteredQuantity}</span> : null}
            </label>
            <label className="space-y-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Эффективность, %
              <input type="number" min={1} max={100} step={0.1} value={efficiency} onChange={(event) => setEfficiency(event.target.value)} className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200" />
              {sectionErrors.efficiency ? <span className="block text-xs normal-case tracking-normal text-rose-600">{sectionErrors.efficiency}</span> : null}
            </label>
            <label className="space-y-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Кипячение, мин
              <input type="number" min={1} max={600} step={1} value={boilTimeMinutes} onChange={(event) => setBoilTimeMinutes(event.target.value)} className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200" />
              {sectionErrors.boilTimeMinutes ? <span className="block text-xs normal-case tracking-normal text-rose-600">{sectionErrors.boilTimeMinutes}</span> : null}
            </label>
          </div>

          <div className="mt-3 border-t border-zinc-100 pt-3">
            <label className="space-y-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Оборудование
              <select
                value={equipmentProfileSelectValue}
                onChange={(event) => onSelectEquipmentProfile(event.target.value || null)}
                className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm normal-case tracking-normal text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              >
                <option value={equipmentProfileSelectValue} hidden>{selectedEquipmentProfileLabel}</option>
                <option value="">Без профиля — ручной ввод параметров</option>
                {equipmentProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}{profile.isDefault ? " · Основной" : ""} — {formatEquipmentProfileLitersValue(profile.targetBatchVolumeL)} · {formatEquipmentProfilePercentValue(profile.brewhouseEfficiencyPct)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function BitternessCalculationBlock({
  calculationMeta,
  onChange
}: {
  calculationMeta: RecipeCalculationMeta;
  onChange: (next: RecipeCalculationMeta) => void;
}) {
  return (
    <details className="group rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-zinc-700">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-100">
          <Target className="h-3.5 w-3.5 text-zinc-500" />
        </div>
        Расчет горечи
        <span className="text-xs font-normal text-zinc-400">{recipeBitternessFormulaLabels[calculationMeta.bitternessFormula]}</span>
        <ChevronRight className="ml-auto h-4 w-4 text-zinc-400 transition-transform group-open:rotate-90" />
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="text-xs text-zinc-600">
          Формула IBU
          <select
            value={calculationMeta.bitternessFormula}
            onChange={(event) => onChange({
              ...calculationMeta,
              bitternessFormula: event.target.value as RecipeCalculationMeta["bitternessFormula"]
            })}
            className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
          >
            {recipeBitternessFormulas.map((formula) => (
              <option key={formula} value={formula}>{recipeBitternessFormulaLabels[formula]}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600">
          Whirlpool factor
          <input
            type="number"
            min={0.1}
            max={3}
            step={0.05}
            value={calculationMeta.bitternessSettings.whirlpoolUtilizationFactor ?? 1}
            onChange={(event) => onChange({
              ...calculationMeta,
              bitternessSettings: {
                ...calculationMeta.bitternessSettings,
                whirlpoolUtilizationFactor: Number(event.target.value || 1)
              }
            })}
            className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
          />
        </label>
      </div>
      <label className="mt-3 flex items-start gap-2 text-xs text-zinc-600">
        <input
          type="checkbox"
          checked={calculationMeta.bitternessSettings.includeBoilCarryoverIntoWhirlpool ?? true}
          onChange={(event) => onChange({
            ...calculationMeta,
            bitternessSettings: {
              ...calculationMeta.bitternessSettings,
              includeBoilCarryoverIntoWhirlpool: event.target.checked
            }
          })}
          className="mt-0.5 h-4 w-4 rounded border-zinc-300"
        />
        <span>Учитывать carryover позднего boil-хмеля в whirlpool как практическое приближение.</span>
      </label>
      <p className="mt-2 text-xs text-zinc-400">Dry hop не входит в стандартный IBU total по умолчанию.</p>
    </details>
  );
}

function SectionRow({
  ingredient,
  onEdit,
  onDelete,
  onQuantityChange,
  onTimeChange,
  onAddImportedAsCustom,
  onMapImportedSource,
  percentage
}: {
  ingredient: DesignerIngredient;
  onEdit: (ingredient: DesignerIngredient) => void;
  onDelete: (localId: string) => void;
  onQuantityChange: (localId: string, quantity: string) => void;
  onTimeChange: (localId: string, timeMinutes: string) => void;
  onAddImportedAsCustom?: (ingredient: DesignerIngredient) => void;
  onMapImportedSource?: (ingredient: DesignerIngredient) => void;
  percentage?: number | null;
}) {
  const accent = categoryAccentBorder[ingredient.category];
  const unitLabel = inventoryUnitLabels[ingredient.amountEnteredUnit] ?? ingredient.amountEnteredUnit;
  const quantityStep = getInventoryUnitInputStep(ingredient.amountEnteredUnit);
  const hopUseType = ingredient.category === "hop" ? getHopUseType(ingredient) : null;
  const hasInlineTimeControl = hopUseType === "boil" || hopUseType === "whirlpool" || hopUseType === "dip_hop";
  const isImported = isImportedDesignerIngredient(ingredient);
  const isFromStock = ingredient.inventoryIntentMode === "use_stock" || Boolean(ingredient.inventorySelectionMeta?.inventoryItemId);
  const cardSource = buildDesignerIngredientCardSource(ingredient);
  const technicalBadges = buildRecipeIngredientTechnicalBadges(cardSource, {
    includeConsumableUsageStage: ingredient.category !== "consumable"
  });
  const recipeStageBadges = ingredient.category === "consumable" && ingredient.stage !== "other"
    ? [{
      key: `recipe-stage:${ingredient.stage}`,
      label: stageLabels[ingredient.stage]
    }]
    : [];
  const badges = [...recipeStageBadges, ...technicalBadges];
  const summaryDetails = buildSummaryDetails(ingredient);
  const summaryFallback = badges.length ? null : (ingredient.selectedSummary || ingredient.familyDisplayName || null);

  return (
    <li className={`relative rounded-lg border-l-[3px] bg-white px-3 py-2.5 shadow-sm ring-1 ring-zinc-100 transition-shadow hover:shadow-md ${accent}`}>
      <div className="absolute right-2 top-2 z-10 flex shrink-0 gap-0.5">
        <button
          type="button"
          onClick={() => onEdit(ingredient)}
          className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Редактировать"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(ingredient.localId)}
          className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
          aria-label="Удалить"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-3 pr-14">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">
            <RecipeIngredientTitleBlock
              source={cardSource}
              primaryName={ingredient.selectedName || "Не выбран"}
              secondaryName={ingredient.selectedSecondaryName}
            />
            {isFromStock ? (
              <span className="mt-0.5 shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700">Со склада</span>
            ) : null}
            {isImported ? (
              <span className="mt-0.5 shrink-0 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">Импортировано</span>
            ) : null}
          </div>
          {summaryDetails ? <div className="mt-1 text-xs text-zinc-500">{summaryDetails}</div> : null}
          {summaryFallback ? <div className="mt-1 text-xs text-zinc-500">{summaryFallback}</div> : null}
          {!summaryDetails && !summaryFallback && !badges.length ? <div className="mt-1 text-xs text-zinc-500">-</div> : null}
          <RecipeIngredientTechnicalBadges badges={badges} className="mt-1.5" />
          {isImported ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onAddImportedAsCustom?.(ingredient)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                Сохранить как свой
              </button>
              <button
                type="button"
                onClick={() => onMapImportedSource?.(ingredient)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                Подобрать из каталога
              </button>
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {percentage != null && percentage > 0 ? (
            <span className="shrink-0 px-1 text-[11px] font-medium tabular-nums text-zinc-600">{percentage.toFixed(1)}%</span>
          ) : null}
          <input
            type="number"
            value={ingredient.amountEnteredQuantity}
            onChange={(event) => onQuantityChange(ingredient.localId, event.target.value)}
            className="h-7 w-[72px] rounded-md border border-zinc-200 bg-zinc-50 px-2 text-right text-sm tabular-nums text-zinc-900 focus:border-zinc-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-200"
            min={quantityStep}
            step={quantityStep}
          />
          <span className="text-xs text-zinc-500">{unitLabel}</span>
        </div>
        {hasInlineTimeControl ? (
          <div className="flex shrink-0 items-center gap-1">
            <input
              type="number"
              value={ingredient.stepMeta.timeMinutes ?? ""}
              onChange={(event) => onTimeChange(ingredient.localId, event.target.value)}
              className="h-7 w-[64px] rounded-md border border-zinc-200 bg-zinc-50 px-2 text-right text-sm tabular-nums text-zinc-900 focus:border-zinc-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-200"
              min={0}
              max={600}
              step={1}
            />
            <span className="text-xs text-zinc-500">мин</span>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function WaterTreatmentSectionRow({
  ingredient,
  onEdit,
  onDelete,
  onQuantityChange
}: {
  ingredient: DesignerIngredient;
  onEdit: (ingredient: DesignerIngredient) => void;
  onDelete: (localId: string) => void;
  onQuantityChange: (localId: string, quantity: string) => void;
}) {
  const unitLabel = inventoryUnitLabels[ingredient.amountEnteredUnit] ?? ingredient.amountEnteredUnit;
  const quantityStep = getInventoryUnitInputStep(ingredient.amountEnteredUnit);
  const cardSource = buildDesignerIngredientCardSource(ingredient);
  const formula = resolveWaterTreatmentFormulaLabel(ingredient.technicalData);
  const badges = buildRecipeIngredientTechnicalBadges(cardSource).filter(
    (badge) => badge.label !== formula,
  );
  const summaryDetails = buildSummaryDetails(ingredient);
  const isFromStock = ingredient.inventoryIntentMode === "use_stock" || Boolean(ingredient.inventorySelectionMeta?.inventoryItemId);
  const status = isFromStock
    ? { label: "Со склада", className: "text-emerald-700" }
    : ingredient.ingredientCatalogItemId
      ? { label: "Из каталога", className: "text-zinc-500" }
      : { label: "Добавлено вручную", className: "text-zinc-500" };

  return (
    <li className="relative rounded-lg border-l-[3px] border-l-sky-400 bg-white px-3 py-2.5 shadow-sm ring-1 ring-zinc-100">
      <div className="absolute right-2 top-2 z-10 flex shrink-0 gap-0.5">
        <button
          type="button"
          onClick={() => onEdit(ingredient)}
          className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Редактировать"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(ingredient.localId)}
          className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
          aria-label="Удалить"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-3 pr-14">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="truncate text-sm font-semibold text-zinc-950">
              {ingredient.selectedName || "Не выбран"}
            </span>
            {formula ? (
              <span className="text-sm font-semibold tabular-nums text-zinc-950">
                {formula}
              </span>
            ) : null}
          </div>
          {ingredient.selectedSecondaryName ? (
            <div className="mt-0.5 text-xs text-zinc-500">
              {ingredient.selectedSecondaryName}
            </div>
          ) : null}
          <div className={`mt-1 text-xs ${status.className}`}>
            {status.label}
          </div>
          {summaryDetails ? (
            <div className="mt-1 text-xs text-zinc-500">{summaryDetails}</div>
          ) : null}
          <RecipeIngredientTechnicalBadges badges={badges} className="mt-1.5" />
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-center justify-end gap-1">
            <input
              type="number"
              value={ingredient.amountEnteredQuantity}
              onChange={(event) => onQuantityChange(ingredient.localId, event.target.value)}
              className="h-7 w-[72px] rounded-md border border-zinc-200 bg-zinc-50 px-2 text-right text-sm tabular-nums text-zinc-900 focus:border-zinc-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-200"
              min={quantityStep}
              step={quantityStep}
            />
            <span className="text-xs text-zinc-500">{unitLabel}</span>
          </div>
        </div>
      </div>
    </li>
  );
}

function StockCoverageBlock({
  coverage,
  pending,
  activeRecipeId,
  onAction
}: {
  coverage: RecipeStockCoverageDto | null;
  pending: boolean;
  activeRecipeId: string | null;
  onAction: (action: "sync" | "reserve" | "consume" | "release") => void;
}) {
  const summary = coverage?.summary;
  const hasRecipe = Boolean(activeRecipeId);

  return (
    <details className="group rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-zinc-700">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-50">
          <Package className="h-3.5 w-3.5 text-emerald-600" />
        </div>
        Склад
        {summary ? (
          <span className="text-xs font-normal text-zinc-400">
            {summary.selectedLines}/{summary.totalLines} позиций
          </span>
        ) : null}
        <ChevronRight className="ml-auto h-4 w-4 text-zinc-400 transition-transform group-open:rotate-90" />
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs leading-5 text-zinc-500">
          Autosave рецепта не списывает остатки. Сначала выберите ингредиент «Из склада», затем выполните явное действие.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!hasRecipe || pending}
            onClick={() => onAction("sync")}
            className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            Подобрать из склада
          </button>
          <button
            type="button"
            disabled={!hasRecipe || pending || !summary?.selectedLines}
            onClick={() => onAction("reserve")}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-700 disabled:opacity-50"
          >
            Зарезервировать
          </button>
          <button
            type="button"
            disabled={!hasRecipe || pending || !summary?.selectedLines}
            onClick={() => onAction("consume")}
            className="rounded-md border border-rose-300 bg-white px-3 py-2 text-xs text-rose-700 disabled:opacity-50"
          >
            Списать ингредиенты
          </button>
          <button
            type="button"
            disabled={!hasRecipe || pending || !summary?.selectedLines}
            onClick={() => onAction("release")}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-700 disabled:opacity-50"
          >
            Снять резерв
          </button>
        </div>
        {coverage?.lines.length ? (
          <div className="space-y-1.5">
            {coverage.lines.map((line) => (
              <div key={line.recipeIngredientId} className="grid gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 sm:grid-cols-[minmax(0,1fr)_120px_120px]">
                <div className="min-w-0">
                  <div className="truncate font-medium text-zinc-800">{line.ingredientDisplayName ?? "Позиция рецепта"}</div>
                  <div className="truncate text-zinc-400">{line.inventoryDisplayName ?? "Складская позиция не выбрана"}</div>
                </div>
                <div className="tabular-nums">
                  Нужно: {line.requiredQuantityNormalized} {line.requiredNormalizedUnit}
                </div>
                <div className="text-right tabular-nums">
                  {line.status === "covered" ? "покрыто" : line.status === "reserved" ? "резерв" : line.status === "consumed" ? "списано" : line.status === "short" ? "не хватает" : line.status === "released" ? "снято" : "не выбрано"}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-2.5 text-sm text-zinc-400">Покрытие появится после сохранения рецепта и подбора складских позиций.</p>
        )}
      </div>
    </details>
  );
}

function InteropBlock({
  pending,
  activeRecipeId,
  beerXmlExport,
  beerXmlImport,
  brewfatherJsonImport,
  onBeerXmlExportChange,
  onBeerXmlImportChange,
  onBrewfatherJsonImportChange,
  onExportBeerXml,
  onImportBeerXml,
  onImportBrewfatherJson
}: {
  pending: boolean;
  activeRecipeId: string | null;
  beerXmlExport: string;
  beerXmlImport: string;
  brewfatherJsonImport: string;
  onBeerXmlExportChange: (next: string) => void;
  onBeerXmlImportChange: (next: string) => void;
  onBrewfatherJsonImportChange: (next: string) => void;
  onExportBeerXml: () => void;
  onImportBeerXml: () => void;
  onImportBrewfatherJson: () => void;
}) {
  return (
    <details className="group rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-zinc-700">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-100">
          <FileText className="h-3.5 w-3.5 text-zinc-500" />
        </div>
        Import / export
        <span className="text-xs font-normal text-zinc-400">BeerXML · Brewfather JSON</span>
        <ChevronRight className="ml-auto h-4 w-4 text-zinc-400 transition-transform group-open:rotate-90" />
      </summary>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-zinc-600">BeerXML export</h4>
            <button
              type="button"
              disabled={!activeRecipeId || pending}
              onClick={onExportBeerXml}
              className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              Экспортировать BeerXML
            </button>
          </div>
          <textarea
            value={beerXmlExport}
            onChange={(event) => onBeerXmlExportChange(event.target.value)}
            className="min-h-36 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-800"
            placeholder="После экспорта BeerXML появится здесь."
          />
        </div>
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-zinc-600">BeerXML import</h4>
              <button
                type="button"
                disabled={pending || !beerXmlImport.trim()}
                onClick={onImportBeerXml}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-700 disabled:opacity-50"
              >
                Импортировать BeerXML
              </button>
            </div>
            <textarea
              value={beerXmlImport}
              onChange={(event) => onBeerXmlImportChange(event.target.value)}
              className="min-h-28 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-800"
              placeholder="<RECIPES>...</RECIPES>"
            />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-zinc-600">Импорт из Brewfather (тестовая поддержка)</h4>
              <button
                type="button"
                disabled={pending || !brewfatherJsonImport.trim()}
                onClick={onImportBrewfatherJson}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-700 disabled:opacity-50"
              >
                Импортировать JSON
              </button>
            </div>
            <textarea
              value={brewfatherJsonImport}
              onChange={(event) => onBrewfatherJsonImportChange(event.target.value)}
              className="min-h-28 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-800"
              placeholder='{"name":"Recipe","fermentables":[]}'
            />
          </div>
        </div>
      </div>
    </details>
  );
}

function BrewModeFoundationBlock({
  pending,
  activeRecipeId,
  onCreateBatch
}: {
  pending: boolean;
  activeRecipeId: string | null;
  onCreateBatch: () => void;
}) {
  return (
    <details className="group rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-zinc-700">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-50">
          <Timer className="h-3.5 w-3.5 text-orange-500" />
        </div>
        Пошаговая варка
        <span className="text-xs font-normal text-zinc-400">Пошаговый режим варки появится здесь</span>
        <ChevronRight className="ml-auto h-4 w-4 text-zinc-400 transition-transform group-open:rotate-90" />
      </summary>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p className="max-w-2xl text-xs leading-5 text-zinc-500">
          Партия создается явным действием из текущего рецепта, воды, процесса и стабильных строк ингредиентов.
        </p>
        <button
          type="button"
          disabled={!activeRecipeId || pending}
          onClick={onCreateBatch}
          className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
        >
          Начать варку
        </button>
      </div>
    </details>
  );
}

function RecipeProfiles({
  processMeta,
  onChange
}: {
  processMeta: RecipeProcessMeta;
  onChange: (next: RecipeProcessMeta) => void;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-700">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-50">
            <Thermometer className="h-3.5 w-3.5 text-orange-500" />
          </div>
          Mash Profile
          <span className="ml-1 text-xs font-normal text-zinc-400">({processMeta.mashProfile.steps.length})</span>
        </div>
        <div className="space-y-2">
          {processMeta.mashProfile.steps.map((step, index) => (
            <div key={step.id} className="rounded-lg border-l-[3px] border-l-orange-300 bg-white px-3 py-2.5 shadow-sm ring-1 ring-zinc-100 transition-shadow hover:shadow-md">
              <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="flex h-8 w-7 items-center justify-center rounded-md bg-orange-100 text-xs font-bold text-orange-600">{index + 1}</div>
                  <span className="text-sm font-medium text-zinc-700">Шаг {index + 1}</span>
                </div>
                <div className="ml-auto flex shrink-0 items-end gap-2">
                  <label className="space-y-0.5 text-right">
                    <span className="block text-[10px] text-zinc-400">°C</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={step.temperatureC}
                      onChange={(event) => onChange({
                        ...processMeta,
                        mashProfile: {
                          steps: processMeta.mashProfile.steps.map((candidate) => candidate.id === step.id ? { ...candidate, temperatureC: Number(event.target.value) } : candidate)
                        }
                      })}
                      className="h-7 w-[72px] rounded-md border border-zinc-200 bg-zinc-50 px-2 text-right text-sm tabular-nums text-zinc-900 focus:border-zinc-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-200"
                    />
                  </label>
                  <label className="space-y-0.5 text-right">
                    <span className="block text-[10px] text-zinc-400">мин</span>
                    <input
                      type="number"
                      min={1}
                      max={600}
                      step={1}
                      value={step.durationMinutes}
                      onChange={(event) => onChange({
                        ...processMeta,
                        mashProfile: {
                          steps: processMeta.mashProfile.steps.map((candidate) => candidate.id === step.id ? { ...candidate, durationMinutes: Number(event.target.value) } : candidate)
                        }
                      })}
                      className="h-7 w-[72px] rounded-md border border-zinc-200 bg-zinc-50 px-2 text-right text-sm tabular-nums text-zinc-900 focus:border-zinc-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-200"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => onChange({
                    ...processMeta,
                    mashProfile: {
                      steps: processMeta.mashProfile.steps.filter((candidate) => candidate.id !== step.id)
                    }
                  })}
                  className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                >
                  <span className="text-xs font-medium">✕</span>
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({
              ...processMeta,
              mashProfile: {
                steps: [...processMeta.mashProfile.steps, {
                  id: createLocalId(),
                  name: `Шаг ${processMeta.mashProfile.steps.length + 1}`,
                  temperatureC: 72,
                  durationMinutes: 20
                }]
              }
            })}
            className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          >
            + Добавить шаг
          </button>
        </div>
      </section>

      <details className="group rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-zinc-700">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50">
            <Timer className="h-3.5 w-3.5 text-sky-500" />
          </div>
          Fermentation Profile
          <ChevronRight className="ml-auto h-4 w-4 text-zinc-400 transition-transform group-open:rotate-90" />
        </summary>
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-[11px] font-medium text-zinc-500">
              Осн. температура, °C
              <input
                type="number"
                min={-10}
                max={50}
                step={0.1}
                value={processMeta.fermentationProfile.primaryTemperatureC ?? ""}
                onChange={(event) => onChange({
                  ...processMeta,
                  fermentationProfile: {
                    ...processMeta.fermentationProfile,
                    primaryTemperatureC: event.target.value ? Number(event.target.value) : null
                  }
                })}
                className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums text-zinc-900"
              />
            </label>
            <label className="space-y-1 text-[11px] font-medium text-zinc-500">
              Осн. длительность, дн
              <input
                type="number"
                min={1}
                max={365}
                step={1}
                value={processMeta.fermentationProfile.primaryDurationDays ?? ""}
                onChange={(event) => onChange({
                  ...processMeta,
                  fermentationProfile: {
                    ...processMeta.fermentationProfile,
                    primaryDurationDays: event.target.value ? Number(event.target.value) : null
                  }
                })}
                className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums text-zinc-900"
              />
            </label>
          </div>

          <div className="space-y-2">
            {processMeta.fermentationProfile.extraSteps.map((step, index) => (
              <div key={step.id} className="grid gap-2 rounded-lg border-l-[3px] border-l-sky-300 bg-zinc-50 p-3 ring-1 ring-zinc-100 sm:grid-cols-[auto_100px_100px_auto]">
                <div className="flex h-9 items-center gap-2">
                  <div className="flex h-9 w-7 items-center justify-center rounded-md bg-sky-100 text-xs font-bold text-sky-600">{index + 1}</div>
                  <span className="text-sm font-medium text-zinc-700">Шаг {index + 1}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-zinc-400">°C</span>
                  <input
                    type="number"
                    min={-10}
                    max={50}
                    step={0.1}
                    value={step.temperatureC ?? ""}
                    onChange={(event) => onChange({
                      ...processMeta,
                      fermentationProfile: {
                        ...processMeta.fermentationProfile,
                        extraSteps: processMeta.fermentationProfile.extraSteps.map((candidate) => candidate.id === step.id ? { ...candidate, temperatureC: event.target.value ? Number(event.target.value) : null } : candidate)
                      }
                    })}
                    className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums"
                  />
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-zinc-400">дни</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    step={1}
                    value={step.durationDays ?? ""}
                    onChange={(event) => onChange({
                      ...processMeta,
                      fermentationProfile: {
                        ...processMeta.fermentationProfile,
                        extraSteps: processMeta.fermentationProfile.extraSteps.map((candidate) => candidate.id === step.id ? { ...candidate, durationDays: event.target.value ? Number(event.target.value) : null } : candidate)
                      }
                    })}
                    className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onChange({
                    ...processMeta,
                    fermentationProfile: {
                      ...processMeta.fermentationProfile,
                      extraSteps: processMeta.fermentationProfile.extraSteps.filter((candidate) => candidate.id !== step.id)
                    }
                  })}
                  className="self-end rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                >
                  <span className="text-xs">✕</span>
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onChange({
                ...processMeta,
                fermentationProfile: {
                  ...processMeta.fermentationProfile,
                  extraSteps: [...processMeta.fermentationProfile.extraSteps, {
                    id: createLocalId(),
                    name: `Шаг ${processMeta.fermentationProfile.extraSteps.length + 1}`,
                    temperatureC: null,
                    durationDays: null
                  }]
                }
              })}
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            >
              + Добавить шаг
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {(["coldCrash", "conditioning"] as const).map((key) => (
              <div key={key} className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-100">
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    checked={processMeta.fermentationProfile[key].enabled}
                    onChange={(event) => onChange({
                      ...processMeta,
                      fermentationProfile: {
                        ...processMeta.fermentationProfile,
                        [key]: {
                          ...processMeta.fermentationProfile[key],
                          enabled: event.target.checked
                        }
                      }
                    })}
                    className="rounded"
                  />
                  {key === "coldCrash" ? "Cold crash" : "Conditioning"}
                </label>
                <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-zinc-400">°C</span>
                    <input
                      type="number"
                      min={-10}
                      max={50}
                      step={0.1}
                      value={processMeta.fermentationProfile[key].temperatureC ?? ""}
                      onChange={(event) => onChange({
                        ...processMeta,
                        fermentationProfile: {
                          ...processMeta.fermentationProfile,
                          [key]: {
                            ...processMeta.fermentationProfile[key],
                            temperatureC: event.target.value ? Number(event.target.value) : null
                          }
                        }
                      })}
                      className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-zinc-400">дни</span>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      step={1}
                      value={processMeta.fermentationProfile[key].durationDays ?? ""}
                      onChange={(event) => onChange({
                        ...processMeta,
                        fermentationProfile: {
                          ...processMeta.fermentationProfile,
                          [key]: {
                            ...processMeta.fermentationProfile[key],
                            durationDays: event.target.value ? Number(event.target.value) : null
                          }
                        }
                      })}
                      className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}

function PublicationReadinessDialog({
  open,
  checklist,
  onClose
}: {
  open: boolean;
  checklist: ReturnType<typeof buildRecipePublicationChecklist>;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/45 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Для публичного показа рецепта необходимо заполнить"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-zinc-950">Для публичного показа рецепта необходимо заполнить:</h3>
          <p className="text-sm leading-6 text-zinc-600">Публикация станет доступна, когда все обязательные пункты будут отмечены как готовые.</p>
        </div>

        <div className="mt-4 space-y-2">
          {checklist.map((item) => (
            <div
              key={item.key}
              className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-3 ${item.isSatisfied ? "border-emerald-200 bg-emerald-50/70" : "border-rose-200 bg-rose-50/70"}`}
            >
              <div className="flex min-w-0 items-start gap-2">
                {item.isSatisfied ? (
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                )}
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${item.isSatisfied ? "text-emerald-950" : "text-rose-950"}`}>{item.label}</p>
                  {item.message ? <p className="mt-1 text-xs leading-5 text-zinc-600">{item.message}</p> : null}
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${item.isSatisfied ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                {item.statusLabel}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

const searchStockIngredientsForRecipe = async ({
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

const recipeWaterAddFlowCatalogIdOrder = new Map(
  recipeWaterAddFlowCatalogIds.map((id, index) => [id, index])
);
const recipeWaterAddFlowCatalogIdSet = new Set(recipeWaterAddFlowCatalogIds);
const recipeWaterManualSaltIdSet = new Set<string>(recipeWaterManualSaltIds);
const recipeWaterAddFlowDefaultGroups = ["salt", "base"] as const;

const isRecipeWaterAddFlowSuggestion = (item: IngredientSuggestionItem) => (
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

type RecipeWaterManualSaltAddition =
  NonNullable<RecipeWaterPlanMeta["manualSaltAdditions"]>[number];

type RecipeWaterAddFlowSaltIngredientInput = Pick<
  DesignerIngredient,
  | "amountEnteredQuantity"
  | "amountEnteredUnit"
  | "category"
  | "ingredientCatalogItemId"
>;

const recipeWaterManualSaltWeightUnits = ["g", "kg", "oz", "lb"] as const;

type RecipeWaterManualSaltWeightUnit =
  (typeof recipeWaterManualSaltWeightUnits)[number];

const isRecipeWaterManualSaltWeightUnit = (
  unit: InventoryUnit,
): unit is RecipeWaterManualSaltWeightUnit =>
  recipeWaterManualSaltWeightUnits.includes(
    unit as RecipeWaterManualSaltWeightUnit,
  );

const roundRecipeWaterSaltGrams = (grams: number) =>
  Number(grams.toFixed(2));

const toRecipeWaterSaltGrams = (
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

const normalizeRecipeWaterManualSaltAddition = (
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

const snapshotRecipeWaterResultSaltAdditions = (
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

const seedRecipeWaterManualSaltAdditions = (
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

const mergeRecipeWaterManualSaltAddition = (
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

const fetchRecipeCatalogIngredientsForPicker = async (params: URLSearchParams, signal: AbortSignal) => {
  const response = await fetch(`/api/ingredients/search?${params.toString()}`, { signal });
  if (!response.ok) {
    return [] as IngredientSuggestionItem[];
  }

  const data = await response.json() as IngredientSearchResult;
  return data.items ?? [];
};

const searchRecipeWaterAddFlowCatalogIngredients = async ({
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

function IngredientEditor({
  draft,
  isExisting,
  onChange,
  onSave,
  onCancel,
  onDelete,
  saveLabel,
  fieldError
}: {
  draft: DesignerIngredient;
  isExisting: boolean;
  onChange: (next: DesignerIngredient) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  saveLabel: string;
  fieldError?: string | null;
}) {
  const [pendingCustom, setPendingCustom] = useState(false);
  const [customMessage, setCustomMessage] = useState<string | null>(null);
  const [customFieldErrors, setCustomFieldErrors] = useState<Record<string, string> | undefined>(undefined);
  const [customDisplayName, setCustomDisplayName] = useState(draft.selectedName);
  const [showStockSearch, setShowStockSearch] = useState(false);
  // Подсказки о незаполненных полях показываем только после попытки сохранить,
  // чтобы свежеоткрытая форма не выглядела «сломанной» и красной.
  const [validationRevealed, setValidationRevealed] = useState(false);
  const [fermentableScope, setFermentableScope] = useState<RecipeFermentablePickerScope | null>(() => (
    resolveRecipeFermentablePickerScopeFromIngredient(draft)
  ));

  const isHop = draft.category === "hop";
  const isWaterTreatmentAddFlow = !isExisting && draft.category === "water_treatment";
  const hopUseType = getHopUseType(draft);
  const quantityStep = getInventoryUnitInputStep(draft.amountEnteredUnit);
  const hasIngredientSelection = Boolean(
    draft.ingredientCatalogItemId || draft.userCustomIngredientId || isImportedDesignerIngredient(draft)
  );
  const quantityNum = Number(draft.amountEnteredQuantity);
  const quantityFieldInvalid = hasIngredientSelection && (
    !draft.amountEnteredQuantity.trim() || !Number.isFinite(quantityNum) || quantityNum <= 0
  );
  // Обязательные числовые поля, зависящие от типа добавления. Используем ту же
  // проверку, что и блокировка сохранения, — чтобы подсветка и логика не расходились.
  const hopTimeRequired = isHop && (hopUseType === "boil" || hopUseType === "whirlpool" || hopUseType === "dip_hop");
  const hopTimeRaw = String(draft.stepMeta.timeMinutes ?? "");
  const hopTimeError = hopTimeRequired
    ? validateNumericInput(hopTimeRaw, { label: "Время", required: true, min: 0, max: 600, integer: true })
    : null;
  const hopDurationRequired = isHop && hopUseType === "dry_hop";
  const hopDurationRaw = String(draft.stepMeta.durationDays ?? "");
  const hopDurationError = hopDurationRequired
    ? validateNumericInput(hopDurationRaw, { label: "Длительность", min: 0, max: 365, integer: true, exclusiveMin: true })
    : null;

  // Что подсветить после попытки сохранить. По одному сигналу за раз, сверху вниз.
  const showIngredientHint = validationRevealed && !hasIngredientSelection;
  const showQuantityHint = validationRevealed && quantityFieldInvalid;
  const showHopTimeHint = validationRevealed && Boolean(hopTimeError);
  const showHopDurationHint = validationRevealed && Boolean(hopDurationError);
  // Нижняя строка — только для ошибок, не привязанных к подсвеченным полям выше
  // (например, выход температуры за диапазон), иначе сообщение задвоится.
  const showOtherError = validationRevealed
    && Boolean(fieldError)
    && !showIngredientHint
    && !showQuantityHint
    && !showHopTimeHint
    && !showHopDurationHint;

  // Обязательное и ещё пустое поле спокойно подсвечиваем рамкой, без красного.
  const requiredBorderClass = (invalid: boolean, awaiting: boolean) =>
    invalid ? "border-red-300" : awaiting ? "border-zinc-400" : "border-zinc-200";
  const quantityAwaitingInput = hasIngredientSelection && !draft.amountEnteredQuantity.trim();
  const quantityBorderClass = requiredBorderClass(showQuantityHint, quantityAwaitingInput);
  const hopTimeBorderClass = requiredBorderClass(showHopTimeHint, hopTimeRequired && !hopTimeRaw.trim());
  const hopDurationBorderClass = requiredBorderClass(showHopDurationHint, hopDurationRequired && !hopDurationRaw.trim());

  const quantityInputRef = useRef<HTMLInputElement>(null);
  // Как только ингредиент выбран — ставим курсор на количество (следующий обязательный шаг).
  useEffect(() => {
    if (hasIngredientSelection && !draft.amountEnteredQuantity.trim()) {
      quantityInputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasIngredientSelection]);
  const sourceMode = resolveRecipeIngredientEditorSourceMode(draft.inventoryIntentMode);
  const isWaterTreatmentCatalogMode = draft.category === "water_treatment" && sourceMode === "catalog";
  const fermentableScopeContext = resolveRecipeFermentablePickerScopeContext(fermentableScope);
  const resolvedDraftFermentableSubtype = resolveRecipeFermentableSubtype(draft.category, draft.subtype);
  const pickerSubtype = draft.category === "fermentable"
    ? sourceMode === "custom"
      ? resolvedDraftFermentableSubtype ?? fermentableScopeContext.subtype
      : fermentableScopeContext.subtype ?? resolvedDraftFermentableSubtype
    : resolvedDraftFermentableSubtype;
  const forcedFermentableGroup = draft.category === "fermentable"
    ? buildRecipeFermentableForcedGroup(fermentableScope)
    : null;
  const forcedRecipeIngredientGroup = resolveRecipeIngredientForcedGroup({
    category: draft.category,
    fermentableGroup: forcedFermentableGroup
  });
  const placeholder = draft.category === "fermentable"
    ? pickerSubtype === "malt"
      ? "Найти солод"
      : forcedFermentableGroup?.label
        ? `Найти ${forcedFermentableGroup.label.toLowerCase()}`
        : pickerSubtype === "fermentable"
          ? "Найти сахар, экстракт или другой сбраживаемый ингредиент"
          : "Найти солод, сахар или другой ферментируемый ингредиент"
    : {
      hop: "Найти сорт или форму хмеля",
      yeast: "Найти дрожжи",
      water_treatment: "Найти соль",
      consumable: "Найти Irish Moss, цедру, специю или другую добавку"
    }[draft.category];
  const ingredientSearchType = resolveRecipeIngredientSearchType({
    category: draft.category,
    type: draft.type
  });
  const selectedIngredientPreview = buildSelectedIngredientPreview(draft);
  const selectedStockPreview = sourceMode === "use_stock" && draft.inventorySelectionMeta?.inventoryItemId
    ? selectedIngredientPreview
    : null;
  const selectedCatalogPreview = sourceMode !== "use_stock" ? selectedIngredientPreview : null;
  const selectedPreview = selectedStockPreview ?? selectedCatalogPreview;
  const showRecipeFields = Boolean(selectedPreview || isImportedDesignerIngredient(draft));
  const showIngredientPicker = !selectedPreview && (
    sourceMode === "catalog"
    || (sourceMode === "use_stock" && showStockSearch)
  );
  const autoFocusPicker = shouldAutoFocusRecipeIngredientPicker({
    ingredient: draft,
    hasSelectedPreview: Boolean(selectedPreview),
    sourceMode
  });
  const contextCategoryLabel = resolveRecipeIngredientEditorCategoryLabel({
    category: draft.category
  }) ?? getSectionTitle(draft.category);
  const contextSummary = sourceMode === "use_stock"
    ? `${contextCategoryLabel} · Из склада`
    : draft.category === "fermentable"
      ? `${contextCategoryLabel} · ${sourceMode === "custom" ? "Свой" : "Из каталога"}`
      : resolveInventoryIngredientContextSummary({
        category: draft.category,
        subtype: draft.subtype,
        source: sourceMode === "custom" ? "custom" : "catalog"
      });
  const consumableStageOptions = draft.category === "consumable"
    ? resolveRecipeConsumableStageOptions(draft.technicalData)
    : [];
  const visibleConsumableStageOptions = draft.category === "consumable" && !consumableStageOptions.includes(draft.stage)
    ? [draft.stage, ...consumableStageOptions]
    : consumableStageOptions;

  useEffect(() => {
    if (sourceMode === "custom") {
      setCustomDisplayName(draft.selectedName);
    }
  }, [draft.selectedName, sourceMode]);

  useEffect(() => {
    setFermentableScope(resolveRecipeFermentablePickerScopeFromIngredient(draft));
  }, [draft.localId, draft.category]);

  const switchSourceMode = (mode: RecipeIngredientEditorSourceMode) => {
    if (mode === sourceMode) {
      return;
    }

    setShowStockSearch(false);
    setCustomMessage(null);
    setCustomFieldErrors(undefined);
    onChange({
      ...clearRecipeIngredientSelection(draft),
      inventoryIntentMode: mode,
      inventorySelectionMeta: null
    });
  };
  const switchToCustomWithCurrentName = () => {
    const cleared = clearRecipeIngredientSelection(draft);
    setShowStockSearch(false);
    setCustomMessage(null);
    setCustomFieldErrors(undefined);
    onChange({
      ...cleared,
      selectedName: draft.selectedName,
      inventoryIntentMode: "custom",
      inventorySelectionMeta: null
    });
  };
  const handleFermentableScopeChange = (nextScope: RecipeFermentablePickerScope | null) => {
    setShowStockSearch(false);
    setCustomMessage(null);
    setCustomFieldErrors(undefined);
    setFermentableScope(nextScope);
    onChange(applyRecipeIngredientCategoryContextChange(
      draft,
      "fermentable",
      resolveRecipeFermentablePickerScopeContext(nextScope).subtype
    ));
  };
  const createCustomIngredient = async (payload: CustomIngredientSubmitPayload) => {
    setPendingCustom(true);
    setCustomMessage(null);
    setCustomFieldErrors(undefined);
    const result = await createRecipeCustomIngredientAction({
      category: payload.category,
      subtype: payload.subtype,
      displayName: payload.displayName,
      brand: payload.brand,
      country: payload.country,
      harvestYear: payload.harvestYear,
      fermentableColorEbc: payload.fermentableColorEbc,
      fermentableExtractYieldPct: payload.fermentableExtractYieldPct,
      hopAlphaAcidPct: payload.hopAlphaAcidPct,
      hopForm: payload.hopForm,
      yeastAttenuationPct: payload.yeastAttenuationPct,
      yeastForm: payload.yeastForm,
      defaultDisplayUnit: payload.defaultDisplayUnit
    });
    setPendingCustom(false);
    setCustomFieldErrors(result.fieldErrors);
    if (!result.ok) {
      setCustomMessage(result.message);
    }

    if (result.ok && result.item) {
      onChange(applySelection({
        ...draft,
        inventoryIntentMode: "custom",
        inventorySelectionMeta: null
      }, result.item));
    }
  };
  const canCreateCustomIngredientFromEditor = draft.category !== "water_treatment";
  const emptyCta = ({
    hasActiveFilters,
    resetFilters
  }: {
    hasActiveFilters: boolean;
    resetFilters: () => void;
  }) => (
    <div className="space-y-3">
      <p className="text-sm text-zinc-700">
        {draft.category === "water_treatment"
          ? "Ничего не найдено"
          : `Ничего не нашли. Попробуйте сменить категорию${hasActiveFilters ? " или сбросить фильтры" : ""}, либо добавьте свой ингредиент.`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-950"
          >
            Сбросить фильтры
          </button>
        ) : null}
        {canCreateCustomIngredientFromEditor ? (
          <>
            <button
              type="button"
              onClick={switchToCustomWithCurrentName}
              className="inline-flex items-center rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              Добавить свой ингредиент
            </button>
            <button
              type="button"
              disabled={!draft.selectedName.trim()}
              onClick={async () => {
                const result = await proposeRecipeIngredientAction({
                  category: draft.category,
                  subtype: pickerSubtype,
                  displayName: draft.selectedName.trim()
                });
                setCustomMessage(result.message);
              }}
              className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-60"
            >
              Предложить в каталог
            </button>
          </>
        ) : null}
      </div>
      {customMessage ? <p className="text-xs text-zinc-500">{customMessage}</p> : null}
    </div>
  );

  const sourceModeMeta: Record<RecipeIngredientEditorSourceMode, { label: string; icon: React.ReactNode; description: string }> = {
    use_stock: { label: "Из склада", icon: <Package className="h-3.5 w-3.5" />, description: "Использовать уже купленный" },
    catalog: { label: "Из каталога", icon: <Search className="h-3.5 w-3.5" />, description: "Подобрать по каталогу" },
    custom: { label: "Свой", icon: <Sparkles className="h-3.5 w-3.5" />, description: "Создать свой" }
  };
  const sourceModeOptions: RecipeIngredientEditorSourceMode[] =
    draft.category === "water_treatment"
      ? sourceMode === "custom"
        ? ["catalog", "use_stock", "custom"]
        : ["catalog", "use_stock"]
      : ["use_stock", "catalog", "custom"];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-zinc-950 sm:text-lg">
            {isWaterTreatmentAddFlow ? "Новая соль для воды" : isExisting ? "Редактор позиции" : "Новая позиция"}
          </h3>
          <p className="mt-0.5 truncate text-xs text-zinc-500">{contextCategoryLabel}</p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
          onClick={onCancel}
          aria-label="Закрыть"
          title="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
        {isWaterTreatmentAddFlow ? null : (
          <RecipeIngredientCategoryGrid
            value={draft.category}
            onChange={(nextCategory) => {
              setShowStockSearch(false);
              setCustomMessage(null);
              setCustomFieldErrors(undefined);
              setFermentableScope(null);
              onChange(applyRecipeIngredientCategoryContextChange(draft, nextCategory));
            }}
            legend="Категория ингредиента"
            testId="recipe-ingredient-category-grid"
          />
        )}

        <div>
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">Источник</span>
          <div
            className={`grid gap-1.5 rounded-xl bg-zinc-100 p-1 ${sourceModeOptions.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}
            data-testid="recipe-ingredient-source-switch"
          >
            {sourceModeOptions.map((mode) => {
              const meta = sourceModeMeta[mode];
              const active = sourceMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => switchSourceMode(mode)}
                  className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 text-xs font-medium transition-all sm:flex-row sm:gap-2 sm:py-2.5 sm:text-sm ${active ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-600 hover:text-zinc-800"}`}
                  aria-pressed={active}
                >
                  <span className={`shrink-0 ${active ? "text-zinc-900" : "text-zinc-500"}`}>{meta.icon}</span>
                  <span className="truncate">{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <InventoryIngredientContextSummary
          summary={contextSummary}
          testId="recipe-ingredient-context-summary"
        />

        {draft.category === "fermentable" && !selectedPreview && sourceMode !== "custom" ? (
          <RecipeFermentableScopePicker
            value={fermentableScope}
            onChange={handleFermentableScopeChange}
          />
        ) : null}

        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700">Ингредиент</label>
          {selectedPreview ? (
            <IngredientSelectionCard
              item={selectedPreview}
              label={selectedStockPreview ? "Выбрано со склада" : selectedPreview.source === "custom" ? "Выбрано: свой ингредиент" : "Выбрано из каталога"}
              actionLabel="Изменить выбор"
              onAction={() => {
                setShowStockSearch(false);
                onChange(clearRecipeIngredientSelection(draft));
              }}
              hideTypedSummary={!selectedStockPreview || draft.category === "consumable"}
              hideSubtitle={!selectedStockPreview}
              mergeBrandAndCountry
            />
          ) : sourceMode === "custom" ? (
            <div className="space-y-3" data-testid="recipe-custom-ingredient-create-panel">
              <CustomIngredientForm
                mode="recipe"
                category={draft.category}
                initialSubtype={pickerSubtype}
                subtypeOptions={draft.category === "consumable" ? recipeConsumableSubtypeOptions : undefined}
                initialDisplayName={draft.selectedName}
                pending={pendingCustom}
                fieldErrors={customFieldErrors}
                submitLabel="Создать свой ингредиент"
                onDisplayNameChange={(value) => {
                  setCustomMessage(null);
                  setCustomDisplayName(value);
                }}
                onSubmit={createCustomIngredient}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!customDisplayName.trim()}
                  onClick={async () => {
                    const result = await proposeRecipeIngredientAction({
                      category: draft.category,
                      subtype: pickerSubtype,
                      displayName: customDisplayName.trim()
                    });
                    setCustomMessage(result.message);
                  }}
                  className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-60"
                >
                  Предложить в каталог
                </button>
              </div>
              {customMessage ? <p className="text-xs text-zinc-500">{customMessage}</p> : null}
            </div>
          ) : (
            <>
              {showIngredientPicker ? (
                <IngredientPicker
                  type={ingredientSearchType}
                  category={draft.category}
                  subtype={pickerSubtype}
                  forcedGroup={forcedRecipeIngredientGroup}
                  hideForcedGroupChip
                  onForcedGroupClear={forcedFermentableGroup ? () => handleFermentableScopeChange(null) : undefined}
                  value={draft.selectedName}
                  onValueChange={(value) => onChange(applyQueryChange(draft, value))}
                  onSelect={(item) => {
                    setShowStockSearch(false);
                    onChange(applySelection(draft, item));
                  }}
                  searchIngredients={
                    sourceMode === "use_stock"
                      ? searchStockIngredientsForRecipe
                      : isWaterTreatmentCatalogMode
                        ? searchRecipeWaterAddFlowCatalogIngredients
                        : undefined
                  }
                  hydrateRecentSelectionsOnInit={sourceMode !== "use_stock"}
                  enableQuickStart={sourceMode !== "use_stock" && !isWaterTreatmentCatalogMode}
                  allowCustomOnlyFilter={sourceMode !== "use_stock" && !isWaterTreatmentCatalogMode}
                  searchOnEmptyQuery={isWaterTreatmentCatalogMode}
                  limit={isWaterTreatmentCatalogMode ? recipeWaterAddFlowCatalogIds.length : undefined}
                  autoFocus={autoFocusPicker}
                  placeholder={
                    sourceMode === "use_stock"
                      ? "Поиск по складу"
                      : isWaterTreatmentCatalogMode
                        ? "Найти соль"
                        : placeholder
                  }
                  emptyCta={emptyCta}
                />
              ) : null}
              <StockIngredientList
                active={sourceMode === "use_stock"}
                category={draft.category}
                type={ingredientSearchType}
                subtype={pickerSubtype}
                group={forcedRecipeIngredientGroup?.value ?? undefined}
                searchIngredients={searchStockIngredientsForRecipe}
                onOverflowChange={setShowStockSearch}
                onSelect={(item) => {
                  setShowStockSearch(false);
                  onChange(applySelection(draft, item));
                }}
              />
            </>
          )}
          {showIngredientHint ? (
            <p className="text-xs text-red-500">Выберите ингредиент из списка, чтобы продолжить.</p>
          ) : null}
        </div>

        {showRecipeFields ? (
          <>
            <div className="grid items-start gap-3 sm:grid-cols-[1fr_160px]">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-700">Количество</label>
                <input
                  ref={quantityInputRef}
                  type="number"
                  min={quantityStep}
                  step={quantityStep}
                  value={draft.amountEnteredQuantity}
                  onChange={(event) => onChange({ ...draft, amountEnteredQuantity: event.target.value })}
                  aria-invalid={showQuantityHint || undefined}
                  className={`h-10 w-full rounded-md border bg-white px-3 text-sm text-zinc-900 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-900/10 ${quantityBorderClass}`}
                />
                {showQuantityHint ? (
                  <p className="text-xs text-red-500">Укажите количество больше нуля.</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-700">Ед. изм.</label>
                <select
                  value={draft.amountEnteredUnit}
                  onChange={(event) => onChange({ ...draft, amountEnteredUnit: event.target.value as InventoryUnit })}
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                >
                  {draft.allowedUnits.map((unit) => (
                    <option key={unit} value={unit}>{inventoryUnitLabels[unit] ?? unit}</option>
                  ))}
                </select>
              </div>
            </div>

            {draft.category === "fermentable" ? (
              <div className="grid gap-3 sm:grid-cols-[180px_160px]">
                <label className="space-y-1 text-xs font-medium text-zinc-700">
                  Использование
                  <select
                    value={draft.stepMeta.use ?? "mash"}
                    onChange={(event) => onChange({
                      ...draft,
                      stage: event.target.value === "boil" ? "boil" : "mash",
                      stepMeta: {
                        ...draft.stepMeta,
                        use: event.target.value
                      }
                    })}
                    className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  >
                    {recipeFermentableUseTypes.map((use) => <option key={use} value={use}>{fermentableUseLabels[use]}</option>)}
                  </select>
                </label>
                {(draft.stepMeta.use ?? "mash") === "boil" ? (
                  <label className="space-y-1 text-xs font-medium text-zinc-700">
                    Минут от конца
                    <input
                      type="number"
                      min={0}
                      max={600}
                      step={1}
                      value={draft.stepMeta.timeMinutes ?? ""}
                      onChange={(event) => onChange({
                        ...draft,
                        timeOffset: event.target.value,
                        stepMeta: {
                          ...draft.stepMeta,
                          timeMinutes: event.target.value
                        }
                      })}
                      className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            {isHop ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium text-zinc-700">
                  Тип добавления
                  <select
                    value={hopUseType}
                    onChange={(event) => onChange({
                      ...draft,
                      stage: mapHopStageFromUseType(event.target.value as RecipeHopUseType),
                      stepMeta: {
                        ...draft.stepMeta,
                        useType: event.target.value as RecipeHopUseType
                      }
                    })}
                    className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  >
                    {recipeHopUseTypeUiOrder.map((useType) => <option key={useType} value={useType}>{hopUseTypeLabels[useType]}</option>)}
                  </select>
                </label>

                {(hopUseType === "boil" || hopUseType === "whirlpool" || hopUseType === "dip_hop") ? (
                  <label className="space-y-1 text-xs font-medium text-zinc-700">
                    Минут
                    <input
                      type="number"
                      min={0}
                      max={600}
                      step={1}
                      value={draft.stepMeta.timeMinutes ?? ""}
                      onChange={(event) => onChange({
                        ...draft,
                        timeOffset: event.target.value,
                        stepMeta: {
                          ...draft.stepMeta,
                          timeMinutes: event.target.value
                        }
                      })}
                      aria-invalid={showHopTimeHint || undefined}
                      className={`h-10 w-full rounded-md border bg-white px-3 text-sm text-zinc-900 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-900/10 ${hopTimeBorderClass}`}
                    />
                    {showHopTimeHint ? (
                      <p className="text-xs font-normal text-red-500">{hopTimeError}</p>
                    ) : (
                      <p className="text-xs font-normal text-zinc-500">Время задаёт горечь (IBU).</p>
                    )}
                  </label>
                ) : hopUseType === "dry_hop" ? (
                  <label className="space-y-1 text-xs font-medium text-zinc-700">
                    Длительность, дн
                    <input
                      type="number"
                      min={1}
                      max={365}
                      step={1}
                      value={draft.stepMeta.durationDays ?? ""}
                      onChange={(event) => onChange({
                        ...draft,
                        stepMeta: {
                          ...draft.stepMeta,
                          durationDays: event.target.value
                        }
                      })}
                      aria-invalid={showHopDurationHint || undefined}
                      className={`h-10 w-full rounded-md border bg-white px-3 text-sm text-zinc-900 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-900/10 ${hopDurationBorderClass}`}
                    />
                    {showHopDurationHint ? (
                      <p className="text-xs font-normal text-red-500">{hopDurationError}</p>
                    ) : null}
                  </label>
                ) : (
                  <label className="space-y-1 text-xs font-medium text-zinc-700">
                    Stage label
                    <input
                      value={draft.stepMeta.stageLabel ?? ""}
                      onChange={(event) => onChange({
                        ...draft,
                        stepMeta: {
                          ...draft.stepMeta,
                          stageLabel: event.target.value
                        }
                      })}
                      className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                      placeholder="Например, first wort"
                    />
                  </label>
                )}

                {(hopUseType === "whirlpool" || hopUseType === "dip_hop") ? (
                  <label className="space-y-1 text-xs font-medium text-zinc-700">
                    Температура, °C
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={draft.stepMeta.temperatureC ?? ""}
                      onChange={(event) => onChange({
                        ...draft,
                        stepMeta: {
                          ...draft.stepMeta,
                          temperatureC: event.target.value
                        }
                      })}
                      placeholder="85"
                      className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    />
                    <p className="text-xs font-normal text-zinc-500">Если пусто — берётся 85&nbsp;°C.</p>
                  </label>
                ) : null}
              </div>
            ) : null}

            {draft.category === "yeast" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium text-zinc-700">
                  Основная температура брожения, °C
                  <input
                    type="number"
                    min={-10}
                    max={50}
                    step={0.1}
                    value={draft.stepMeta.fermentationTempC ?? ""}
                    onChange={(event) => onChange({
                      ...draft,
                      stepMeta: {
                        ...draft.stepMeta,
                        fermentationTempC: event.target.value
                      }
                    })}
                    className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  />
                </label>
                {draft.selectedSummary ? (
                  <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                    {draft.selectedSummary}
                  </div>
                ) : null}
              </div>
            ) : null}

            {draft.category === "water_treatment" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium text-zinc-700">
                  Стадия
                  <select
                    value={draft.stage}
                    onChange={(event) => onChange({ ...draft, stage: event.target.value as DesignerIngredient["stage"] })}
                    className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  >
                    {Object.entries(stageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-xs font-medium text-zinc-700">
                  Время, если нужно
                  <input
                    type="number"
                    min={0}
                    max={600}
                    step={1}
                    value={draft.stepMeta.timeMinutes ?? ""}
                    onChange={(event) => onChange({
                      ...draft,
                      timeOffset: event.target.value,
                      stepMeta: {
                        ...draft.stepMeta,
                        timeMinutes: event.target.value
                      }
                    })}
                    className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                    placeholder="минуты"
                  />
                </label>
              </div>
            ) : null}

            {draft.category === "consumable" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <fieldset className="space-y-1">
                  <legend className="text-xs font-medium text-zinc-700">Стадия добавления</legend>
                  <div className="flex flex-wrap gap-1.5" data-testid="recipe-consumable-stage-options">
                    {visibleConsumableStageOptions.map((stage) => {
                      const active = draft.stage === stage;
                      return (
                        <button
                          key={stage}
                          type="button"
                          onClick={() => onChange({ ...draft, stage })}
                          className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${active
                            ? "border-zinc-950 bg-zinc-950 text-white"
                            : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
                          }`}
                          aria-pressed={active}
                        >
                          {stageLabels[stage]}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <label className="space-y-1 text-xs font-medium text-zinc-700">
                  Время, если нужно
                  <input
                    type="number"
                    min={0}
                    max={600}
                    step={1}
                    value={draft.stepMeta.timeMinutes ?? ""}
                    onChange={(event) => onChange({
                      ...draft,
                      timeOffset: event.target.value,
                      stepMeta: {
                        ...draft.stepMeta,
                        timeMinutes: event.target.value
                      }
                    })}
                    className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                    placeholder="минуты"
                  />
                </label>
              </div>
            ) : null}
          </>
        ) : null}

        {showOtherError ? (
          <p className="flex items-center gap-1.5 text-xs text-red-500">
            <CircleAlert className="h-3.5 w-3.5 shrink-0" />
            <span>{fieldError}</span>
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-100 bg-white px-4 py-3 sm:px-6 sm:py-4">
        <div>
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-sm font-medium text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Удалить</span>
            </button>
          ) : null}
        </div>
        <div className="flex flex-1 justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Отмена
          </button>
          {showRecipeFields ? (
            <button
              type="button"
              onClick={() => {
                setValidationRevealed(true);
                onSave();
              }}
              className="inline-flex h-10 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800"
            >
              {saveLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function RecipeDesigner({
  mode,
  initialRecipe,
  initialTitle,
  initialIngredientSelection = null,
  initialStockCoverage = null,
  initialImages = [],
  equipmentProfiles = [],
  onSaveStatusChange,
  onRecipeCreated,
  onPublicationStateChange
}: Props) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const initialPublicationState = normalizeEditorPublicationState(initialRecipe?.publicationState);
  const initialDefaultEquipmentProfile = initialRecipe
    ? null
    : equipmentProfiles.find((profile) => profile.isDefault) ?? equipmentProfiles[0] ?? null;
  const initialSavedEquipmentProfile = initialRecipe?.equipmentProfileId
    ? equipmentProfiles.find((profile) => profile.id === initialRecipe.equipmentProfileId) ?? null
    : null;
  const initialSelectedEquipmentProfile = initialRecipe ? initialSavedEquipmentProfile : initialDefaultEquipmentProfile;
  const [activeRecipeId, setActiveRecipeId] = useState(initialRecipe?.id ?? null);
  const [activeRecipeSlug, setActiveRecipeSlug] = useState(initialRecipe?.slug ?? null);
  const [activeVersionNumber, setActiveVersionNumber] = useState(initialRecipe?.versionNumber ?? 1);
  const [recipeVersions, setRecipeVersions] = useState(initialRecipe?.versions ?? []);
  const [title, setTitle] = useState(initialRecipe?.title ?? initialTitle ?? "");
  const [styleId, setStyleId] = useState(initialRecipe?.styleId ?? "");
  const [description, setDescription] = useState(initialRecipe?.description ?? "");
  const [authorNotes, setAuthorNotes] = useState(initialRecipe?.authorNotes ?? "");
  const [publicationState, setPublicationState] = useState<RecipePublicationState>(initialPublicationState);
  const [savedPublicationState, setSavedPublicationState] = useState<RecipePublicationState>(initialPublicationState);
  const [batchSize, setBatchSize] = useState({
    quantity: initialRecipe
      ? String(initialRecipe.batchSizeEnteredQuantity)
      : String(initialDefaultEquipmentProfile?.targetBatchVolumeL ?? 20),
    unit: "l" as InventoryUnit
  });
  const [efficiency, setEfficiency] = useState(initialRecipe?.efficiency != null
    ? String(initialRecipe.efficiency)
    : String(initialDefaultEquipmentProfile?.brewhouseEfficiencyPct ?? 75));
  const [boilTimeMinutes, setBoilTimeMinutes] = useState(initialRecipe?.boilTimeMinutes != null ? String(initialRecipe.boilTimeMinutes) : "60");
  const [processMeta, setProcessMeta] = useState<RecipeProcessMeta>(() => cloneRecipeProcessMeta(initialRecipe?.processMeta ?? defaultRecipeProcessMeta));
  const [calculationMeta, setCalculationMeta] = useState<RecipeCalculationMeta>(() => cloneRecipeCalculationMeta(initialRecipe?.calculationMeta ?? null));
  const [waterPlanMeta, setWaterPlanMeta] = useState<RecipeWaterPlanMeta>(() => cloneRecipeWaterPlanMeta(initialRecipe?.waterPlanMeta ?? null));
  const [equipmentProfileId, setEquipmentProfileId] = useState<string | null>(initialSelectedEquipmentProfile?.id ?? null);
  const [equipmentProfileSnapshot, setEquipmentProfileSnapshot] = useState<EquipmentProfileSnapshot | null>(() => (
    initialRecipe
      ? (
        initialSavedEquipmentProfile
          ? cloneEquipmentProfileSnapshot(initialRecipe.equipmentProfileSnapshot ?? null)
            ?? buildEquipmentProfileSnapshotFromDto(initialSavedEquipmentProfile)
          : null
      )
      : (initialDefaultEquipmentProfile ? buildEquipmentProfileSnapshotFromDto(initialDefaultEquipmentProfile) : null)
  ));
  const [ingredients, setIngredients] = useState<DesignerIngredient[]>(initialRecipe?.ingredients.map(toDesignerIngredient) ?? []);
  const [stockCoverage, setStockCoverage] = useState<RecipeStockCoverageDto | null>(initialStockCoverage);
  const [beerXmlExport, setBeerXmlExport] = useState("");
  const [beerXmlImport, setBeerXmlImport] = useState("");
  const [brewfatherJsonImport, setBrewfatherJsonImport] = useState("");
  const [openEditor, setOpenEditor] = useState<OpenEditorState | null>(null);
  const [saveResult, setSaveResult] = useState<RecipeEditorResult | null>(null);
  const [preview, setPreview] = useState<RecipeDraftPreviewDto | null>(buildInitialPreview(initialRecipe));
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);
  const [blockedSignature, setBlockedSignature] = useState<string | null>(null);
  const [saveResultSignature, setSaveResultSignature] = useState<string | null>(null);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [makePrivateConfirmOpen, setMakePrivateConfirmOpen] = useState(false);
  const [makePrivateError, setMakePrivateError] = useState<string | null>(null);
  const [readinessDialogOpen, setReadinessDialogOpen] = useState(false);
  const [bitternessSettingsOpen, setBitternessSettingsOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [startBrewOpen, setStartBrewOpen] = useState(false);
  const [startBrewResult, setStartBrewResult] = useState<StartBrewResult>(null);
  const [brewOnDeviceOpen, setBrewOnDeviceOpen] = useState(false);
  const pendingSaveRef = useRef(false);
  const initialSelectionAppliedRef = useRef(false);

  const payload = useMemo<RecipeEditorPayload>(() => ({
    title,
    styleId: styleId.trim() || null,
    description: description.trim() || null,
    authorNotes: authorNotes.trim() || null,
    publicationState,
    batchSizeEnteredQuantity: Number(batchSize.quantity || 0),
    batchSizeEnteredUnit: batchSize.unit,
    efficiency: efficiency.trim() ? Number(efficiency) : null,
    boilTimeMinutes: Number(boilTimeMinutes || 0),
    processMeta,
    calculationMeta,
    equipmentProfileId,
    equipmentProfileSnapshot,
    waterPlanMeta,
    ingredients: ingredients.map(buildIngredientPayload)
  }), [authorNotes, batchSize.quantity, batchSize.unit, boilTimeMinutes, calculationMeta, description, efficiency, equipmentProfileId, equipmentProfileSnapshot, ingredients, processMeta, publicationState, styleId, title, waterPlanMeta]);
  const batchVolumeL = useMemo(
    () => getBatchVolumeLiters(batchSize.quantity, batchSize.unit),
    [batchSize.quantity, batchSize.unit],
  );
  const fermentableWeightKg = useMemo(
    () => getFermentableWeightTotalKg(ingredients),
    [ingredients],
  );
  const equipmentVolumePlan = useMemo(() => {
    if (!equipmentProfileSnapshot) {
      return null;
    }

    const effectiveEquipmentProfile = {
      ...equipmentProfileSnapshot,
      targetBatchVolumeL:
        batchVolumeL ?? equipmentProfileSnapshot.targetBatchVolumeL,
      grainAbsorptionLPerKg:
        waterPlanMeta.grainAbsorptionLPerKg ??
        equipmentProfileSnapshot.grainAbsorptionLPerKg,
    };

    return {
      ...calculateEquipmentVolumePlan(
        effectiveEquipmentProfile,
        fermentableWeightKg,
        Number(boilTimeMinutes || 0),
      ),
      grainAbsorptionLPerKg: effectiveEquipmentProfile.grainAbsorptionLPerKg,
    };
  }, [
    batchVolumeL,
    boilTimeMinutes,
    equipmentProfileSnapshot,
    fermentableWeightKg,
    waterPlanMeta.grainAbsorptionLPerKg,
  ]);
  const waterPlanResult = useMemo(() => buildRecipeWaterPlanResult({
    waterPlanMeta,
    fallbackBatchVolumeL: batchVolumeL,
    boilTimeMinutes: Number(boilTimeMinutes || 0),
    equipmentVolumePlan,
    grainKg: fermentableWeightKg,
    beerSrm: preview?.color ?? initialRecipe?.color ?? null,
    fermentables: getFermentablesForWaterPlan(ingredients)
  }), [batchVolumeL, boilTimeMinutes, equipmentVolumePlan, fermentableWeightKg, ingredients, initialRecipe?.color, preview?.color, waterPlanMeta]);
  const calculatedWaterPlanMeta = useMemo(
    () => setRecipeWaterSaltCalculationMode(waterPlanMeta, "auto"),
    [waterPlanMeta],
  );
  const calculatedWaterPlanResult = useMemo(() => buildRecipeWaterPlanResult({
    waterPlanMeta: calculatedWaterPlanMeta,
    fallbackBatchVolumeL: batchVolumeL,
    boilTimeMinutes: Number(boilTimeMinutes || 0),
    equipmentVolumePlan,
    grainKg: fermentableWeightKg,
    beerSrm: preview?.color ?? initialRecipe?.color ?? null,
    fermentables: getFermentablesForWaterPlan(ingredients)
  }), [batchVolumeL, boilTimeMinutes, calculatedWaterPlanMeta, equipmentVolumePlan, fermentableWeightKg, ingredients, initialRecipe?.color, preview?.color]);
  const savePayload = useMemo(() => normalizeSavePayload(payload), [payload]);

  const currentSignature = useMemo(() => JSON.stringify(payload), [payload]);
  const [savedSignature, setSavedSignature] = useState(currentSignature);
  const isDirty = currentSignature !== savedSignature;
  const hasCurrentSaveError = saveResultSignature === currentSignature && Boolean(saveResult && !saveResult.ok);
  const saveStatus: RecipeSaveStatus = hasCurrentSaveError ? "error" : (pendingSave || isDirty ? "saving" : "saved");
  const persistMode: "create" | "edit" = activeRecipeId ? "edit" : mode;

  useEffect(() => {
    onSaveStatusChange?.(saveStatus);
  }, [onSaveStatusChange, saveStatus]);

  useEffect(() => {
    if (initialSelectionAppliedRef.current || !initialIngredientSelection || initialRecipe) {
      return;
    }

    const selectionCategory = initialIngredientSelection.category
      ?? resolveIngredientCategory({ type: initialIngredientSelection.type });
    const draft = applySelection(
      createEmptyIngredient(
        selectionCategory,
        "boil",
        resolveRecipeFermentableSubtype(selectionCategory, initialIngredientSelection.subtype ?? null)
      ),
      initialIngredientSelection
    );
    initialSelectionAppliedRef.current = true;
    setOpenEditor({
      localId: null,
      category: selectionCategory,
      draft,
      initialSignature: serializeIngredient(draft),
      isExisting: false
    });
  }, [initialIngredientSelection, initialRecipe]);

  useEffect(() => {
    onPublicationStateChange?.(savedPublicationState);
  }, [onPublicationStateChange, savedPublicationState]);

  useEffect(() => {
    pendingSaveRef.current = pendingSave;
  }, [pendingSave]);

  useEffect(() => {
    if (typeof window === "undefined" || (!isDirty && !pendingSave)) {
      return undefined;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, pendingSave]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setRecalculating(true);
      const result = await previewRecipeDraftAction(savePayload);
      startTransition(() => {
        if (cancelled) {
          return;
        }

        if (result.ok && result.preview) {
          setPreview(result.preview);
          setPreviewError(null);
        } else {
          setPreviewError(result.message ?? "Не удалось обновить расчёт.");
        }
        setRecalculating(false);
      });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [savePayload]);

  const persistRecipe = React.useCallback(async ({
    nextPublicationState = publicationState,
    surfaceInlineResult = true
  }: {
    nextPublicationState?: RecipePublicationState;
    surfaceInlineResult?: boolean;
  } = {}) => {
    if (pendingSaveRef.current) {
      return null;
    }

    const trimmedTitle = payload.title.trim();
    const draftFallbackTitle = initialTitle?.trim() || initialRecipe?.title?.trim() || "Новый рецепт";
    // Приватный черновик не должен морозить весь автосейв из-за пустого названия:
    // подставляем дефолтное имя для сохранения, жёсткую проверку оставляем публикации (#13).
    const effectiveTitle = !trimmedTitle && nextPublicationState !== "published"
      ? draftFallbackTitle
      : payload.title;
    const nextPayload = normalizeSavePayload({
      ...payload,
      title: effectiveTitle,
      publicationState: nextPublicationState
    });
    const nextSignature = JSON.stringify({
      ...payload,
      publicationState: nextPublicationState
    });
    const nextBlockedSaveResult = buildAutosaveBlockedResult(nextPayload);

    if (nextBlockedSaveResult) {
      setSaveResult(nextBlockedSaveResult);
      setSaveResultSignature(surfaceInlineResult ? nextSignature : null);
      setBlockedSignature(nextSignature);
      return nextBlockedSaveResult;
    }

    setPendingSave(true);
    let result: RecipeEditorResult;
    try {
      result = persistMode === "create"
        ? await createRecipeAction(nextPayload)
        : await updateRecipeAction(activeRecipeId!, nextPayload);
    } catch {
      // Сетевой/серверный сбой: не оставляем pendingSave залипшим (иначе все
      // будущие автосейвы заглушены) и показываем ретраибельную ошибку (P0-1).
      const failure: RecipeEditorResult = {
        ok: false,
        message: "Не удалось сохранить — проверьте соединение и повторите."
      };
      setBlockedSignature(null);
      setSaveResult(failure);
      setSaveResultSignature(surfaceInlineResult ? nextSignature : null);
      return failure;
    } finally {
      setPendingSave(false);
    }

    if (!result.ok && result.fieldErrors && Object.keys(result.fieldErrors).length) {
      setBlockedSignature(nextSignature);
    } else {
      setBlockedSignature(null);
    }

    if (result.ok && result.recipe) {
      const savedRecipe = result.recipe;
      const normalizedState = normalizeEditorPublicationState(savedRecipe.publicationState);
      const completedSignature = JSON.stringify({
        ...payload,
        publicationState: normalizedState
      });

      setPublicationState(normalizedState);
      setSavedPublicationState(normalizedState);
      setSavedSignature(completedSignature);
      setSaveResult(result);
      setSaveResultSignature(completedSignature);
      setActiveRecipeSlug(savedRecipe.slug);
      setActiveVersionNumber(savedRecipe.versionNumber);
      setRecipeVersions(savedRecipe.versions);

      if (!activeRecipeId) {
        setActiveRecipeId(savedRecipe.id);
        onRecipeCreated?.(savedRecipe);
        replaceRecipeEditorUrl(savedRecipe.id);
      }

      return result;
    }

    setSaveResult(result);
    setSaveResultSignature(surfaceInlineResult ? nextSignature : null);
    return result;
  }, [activeRecipeId, initialRecipe, initialTitle, onRecipeCreated, payload, persistMode, publicationState]);

  useEffect(() => {
    if (!isDirty) return;
    if (blockedSignature === currentSignature) return;
    let cancelled = false;
    const autoSaveTimer = window.setTimeout(async () => {
      if (cancelled || pendingSaveRef.current) return;
      await persistRecipe();
    }, 1500);
    return () => { cancelled = true; window.clearTimeout(autoSaveTimer); };
  }, [blockedSignature, currentSignature, isDirty, persistRecipe]);

  const maybeOpenEditor = (next: OpenEditorState) => {
    setOpenEditor(next);
  };

  const closeEditor = () => {
    if (!openEditor) {
      return;
    }

    setOpenEditor(null);
  };

  const openAddEditor = (category: IngredientCategory, hopUseType: RecipeHopUseType = "boil") => {
    const baseDraft = createEmptyIngredient(
      category,
      hopUseType,
      null
    );
    const draft = category === "water_treatment"
      ? {
          ...baseDraft,
          inventoryIntentMode: "catalog" as RecipeInventoryIntentMode,
          inventorySelectionMeta: null,
        }
      : baseDraft;
    maybeOpenEditor({
      localId: null,
      category,
      draft,
      initialSignature: serializeIngredient(draft),
      isExisting: false
    });
  };

  const saveEditor = () => {
    if (!openEditor || !isIngredientValid(openEditor.draft)) {
      return;
    }

    if (!openEditor.localId && openEditor.category === "water_treatment") {
      const nextWaterPlanMeta = applyRecipeWaterAddFlowSaltToWaterPlan({
        waterPlanMeta,
        waterPlanResult,
        ingredient: openEditor.draft,
      });

      if (nextWaterPlanMeta) {
        setWaterPlanMeta(nextWaterPlanMeta);
        setWaterSetupOpen(true);
        setOpenEditor(null);
        return;
      }

      return;
    }

    if (openEditor.localId) {
      setIngredients((current) => current.map((ingredient) => ingredient.localId === openEditor.localId ? openEditor.draft : ingredient));
    } else {
      setIngredients((current) => [...current, openEditor.draft]);
    }
    setOpenEditor(null);
  };

  const deleteIngredient = (localId: string) => {
    setIngredients((current) => current.filter((ingredient) => ingredient.localId !== localId));
    if (openEditor?.localId === localId) {
      setOpenEditor(null);
    }
  };

  const openImportedCatalogMatcher = (ingredient: DesignerIngredient) => {
    const draft = {
      ...ingredient,
      inventoryIntentMode: "catalog" as RecipeInventoryIntentMode,
      inventorySelectionMeta: null
    };
    maybeOpenEditor({
      localId: ingredient.localId,
      category: ingredient.category,
      draft,
      initialSignature: serializeIngredient(draft),
      isExisting: true
    });
  };

  const addImportedIngredientAsCustom = async (ingredient: DesignerIngredient) => {
    const snapshot = readImportedDesignerIngredientSnapshot(ingredient);
    const displayName = snapshot?.name?.trim() || ingredient.selectedName.trim();
    if (!displayName) {
      return;
    }

    setPendingSave(true);
    try {
      const result = await createRecipeCustomIngredientAction({
        category: ingredient.category,
        subtype: ingredient.subtype,
        displayName,
        defaultDisplayUnit: snapshot?.defaultDisplayUnit ?? ingredient.defaultDisplayUnit,
        technicalData: (snapshot?.technicalData ?? null) as IngredientTechnicalData | null
      });
      setSaveResult({ ok: result.ok, message: result.message });
      setSaveResultSignature(currentSignature);

      if (result.ok && result.item) {
        setIngredients((current) => current.map((line) => (
          line.localId === ingredient.localId
            ? applySelection({
              ...line,
              inventoryIntentMode: "custom",
              inventorySelectionMeta: null
            }, result.item!)
            : line
        )));
      }
    } catch {
      setSaveResult({ ok: false, message: "Не удалось сохранить ингредиент — проверьте соединение." });
      setSaveResultSignature(currentSignature);
    } finally {
      setPendingSave(false);
    }
  };

  const updateIngredientQuantity = (localId: string, quantity: string) => {
    setIngredients((current) =>
      current.map((ingredient) => ingredient.localId === localId ? { ...ingredient, amountEnteredQuantity: quantity } : ingredient)
    );
  };

  const updateHopTimeMinutes = (localId: string, timeMinutes: string) => {
    setIngredients((current) =>
      current.map((ingredient) => {
        if (ingredient.localId !== localId || ingredient.category !== "hop") {
          return ingredient;
        }

        return {
          ...ingredient,
          timeOffset: timeMinutes,
          stepMeta: {
            ...ingredient.stepMeta,
            timeMinutes
          }
        };
      })
    );
  };

  const handleSelectEquipmentProfile = React.useCallback((profileId: string | null) => {
    if (!profileId) {
      setEquipmentProfileId(null);
      setEquipmentProfileSnapshot(null);
      return;
    }

    const profile = equipmentProfiles.find((item) => item.id === profileId);
    if (!profile) {
      return;
    }

    setEquipmentProfileId(profile.id);
    setEquipmentProfileSnapshot(buildEquipmentProfileSnapshotFromDto(profile));
    setBatchSize((current) => ({
      ...current,
      quantity: formatEquipmentProfileRecipeValue(profile.targetBatchVolumeL)
    }));
    setEfficiency(formatEquipmentProfileRecipeValue(profile.brewhouseEfficiencyPct));
  }, [equipmentProfiles]);

  const visibleSaveResult = saveResultSignature === currentSignature ? saveResult : null;
  const sectionErrors = visibleSaveResult?.fieldErrors ?? {};
  const hasRetriableSaveError = Boolean(
    visibleSaveResult
    && !visibleSaveResult.ok
    && (!visibleSaveResult.fieldErrors || !Object.keys(visibleSaveResult.fieldErrors).length)
  );
  const publicationValidationContext = {
    title,
    styleId: styleId.trim() || null,
    description: description.trim() || null,
    boilTimeMinutes: savePayload.boilTimeMinutes,
    ingredientCategories: ingredients.map((ingredient) => ingredient.category ?? null)
  };
  const publishChecklist = useMemo(() => buildRecipePublicationChecklist({
    ...publicationValidationContext,
    publicationState: "published"
  }), [description, ingredients, savePayload.boilTimeMinutes, styleId, title]);
  const isPublishReady = publishChecklist.every((item) => item.isSatisfied);
  const canManagePublication = Boolean(activeRecipeId);
  const savedVisibility = savedPublicationState === "published" ? "published" : "private";
  const fermentables = getCategoryRows(ingredients, "fermentable");
  const hops = getCategoryRows(ingredients, "hop");
  const yeasts = getCategoryRows(ingredients, "yeast");
  const waterTreatments = getCategoryRows(ingredients, "water_treatment");
  const consumables = getCategoryRows(ingredients, "consumable");

  const fermentableTotalKg = getFermentableWeightTotalKg(fermentables);
  const hopTotalG = getHopWeightTotalG(hops);
  const [waterSetupOpen, setWaterSetupOpen] = useState(false);
  const [waterResetConfirmOpen, setWaterResetConfirmOpen] = useState(false);
  const openWaterSetup = React.useCallback(() => {
    setWaterSetupOpen(true);
  }, []);
  const closeWaterSetup = React.useCallback(() => {
    setWaterSetupOpen(false);
  }, []);
  const resetWaterSetup = React.useCallback(() => {
    setWaterPlanMeta(createRecipeWaterPlanResetMeta());
    setWaterSetupOpen(false);
  }, []);
  const updateRecipeWaterManualSalt = React.useCallback((
    index: number,
    patch: Partial<{
      grams: number;
      target: RecipeWaterManualSaltAdditionTarget;
    }>
  ) => {
    setWaterPlanMeta((current) => {
      const next = [...(current.manualSaltAdditions ?? [])];
      const item = next[index];
      if (!item) {
        return current;
      }

      next[index] = {
        ...item,
        ...patch,
        grams:
          patch.grams == null
            ? item.grams
            : Number.isFinite(patch.grams)
              ? Math.max(0, patch.grams)
              : 0
      };

      return {
        ...current,
        setupEnabled: true,
        engine: "advanced_manual",
        manualSaltAdditions: next
      };
    });
  }, []);
  const computedWaterAdditiveCount = useMemo(() => {
    if (!waterPlanMeta.setupEnabled || waterPlanMeta.engine !== "advanced_manual") {
      return 0;
    }
    const isSplit = waterPlanResult.waterVolumes.source === "manual_split";
    const saltCount = isSplit
      ? waterPlanResult.mashSaltAdditions.filter((s) => s.grams > 0).length
        + waterPlanResult.spargeSaltAdditions.filter((s) => s.grams > 0).length
      : waterPlanResult.totalSaltAdditions.filter((s) => s.grams > 0).length;
    const acidCount = (waterPlanResult.mashAcidAddition?.mashAcidMl ?? 0) > 0 ? 1 : 0;
    const spargeAcidCount = (waterPlanResult.spargeAcidAddition?.spargeAcidMl ?? 0) > 0 ? 1 : 0;
    return saltCount + acidCount + spargeAcidCount;
  }, [waterPlanMeta.setupEnabled, waterPlanResult]);

  const sectionDefinitions: Array<{
    category: IngredientCategory;
    title: string;
    subtitle?: string;
    items: DesignerIngredient[];
    empty: string;
    renderItems?: (items: DesignerIngredient[]) => React.ReactNode;
  }> = [
      {
        category: "fermentable",
        title: "Сбраживаемое",
        subtitle: fermentables.length ? `${fermentableTotalKg.toFixed(2)} кг` : undefined,
        items: fermentables,
        empty: "Добавьте солод, сахар, экстракт или другие сбраживаемые.",
      },
      {
        category: "hop",
        title: "Хмель",
        subtitle: hops.length ? `${hopTotalG.toFixed(0)} г` : undefined,
        items: hops,
        empty: "Пока нет хмеля. Добавьте кипячение, whirlpool, dry hop или dip hop.",
        renderItems: (items) => {
          const usedTypes = recipeHopUseTypeUiOrder.filter(
            (useType) => useType === "boil" || items.some((item) => getHopUseType(item) === useType)
          );
          const unusedTypes = recipeAdditionalHopUseTypeUiOrder.filter(
            (useType) => !items.some((item) => getHopUseType(item) === useType)
          );
          return (
            <div className="space-y-3">
              {usedTypes.map((useType) => {
                const rows = items
                  .filter((item) => getHopUseType(item) === useType)
                  .sort((left, right) => getHopTimeMinutesValue(right) - getHopTimeMinutesValue(left));
                return (
                  <div key={useType} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-1 pb-1.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">{hopUseTypeSectionLabels[useType]}</h4>
                      {rows.length ? <button type="button" onClick={() => openAddEditor("hop", useType)} className="rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
                        + Добавить
                      </button> : null}
                    </div>
                    {rows.length ? (
                      <ul className="space-y-1.5">
                        {rows.map((ingredient) => (
                          <SectionRow
                            key={ingredient.localId}
                            ingredient={ingredient}
                            onEdit={(value) => maybeOpenEditor({
                              localId: value.localId,
                              category: value.category,
                              draft: { ...value },
                              initialSignature: serializeIngredient(value),
                              isExisting: true
                            })}
                            onDelete={deleteIngredient}
                            onQuantityChange={updateIngredientQuantity}
                            onTimeChange={updateHopTimeMinutes}
                            onAddImportedAsCustom={addImportedIngredientAsCustom}
                            onMapImportedSource={openImportedCatalogMatcher}
                          />
                        ))}
                      </ul>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openAddEditor("hop", useType)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/40 px-4 py-6 text-sm text-zinc-500 transition-colors hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-700"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Добавьте хмель на кипячение</span>
                      </button>
                    )}
                  </div>
                );
              })}
              {unusedTypes.length ? (
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-800">
                    <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                    Другие типы охмеления
                  </summary>
                  <div className="mt-2 space-y-3">
                    {unusedTypes.map((useType) => (
                      <div key={useType} className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-zinc-200 px-3 py-2">
                        <span className="text-xs text-zinc-500">{hopUseTypeLabels[useType]}</span>
                        <button type="button" onClick={() => openAddEditor("hop", useType)} className="rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
                          + Добавить
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          );
        }
      },
      {
        category: "yeast",
        title: "Дрожжи",
        items: yeasts,
        empty: "Добавьте дрожжи для публикации рецепта."
      },
      {
        category: "water_treatment",
        title: "Водоподготовка",
        subtitle:
          computedWaterAdditiveCount + waterTreatments.length > 0
            ? `${computedWaterAdditiveCount + waterTreatments.length} поз.`
            : undefined,
        items: waterTreatments,
        empty: "Нет добавок воды.",
        renderItems: (items) => (
          <div className="space-y-3">
            <RecipeWaterAdditivesSection
              waterPlanMeta={waterPlanMeta}
              waterPlanResult={waterPlanResult}
              onUpdateManualSalt={updateRecipeWaterManualSalt}
              onRemoveManualSalt={(index) =>
                setWaterPlanMeta((current) => removeRecipeWaterManualSaltAddition(current, index))
              }
              onApplyAcidConcentration={(concentrationPct) =>
                setWaterPlanMeta((current) => ({
                  ...current,
                  acidConcentrationPct: concentrationPct
                }))
              }
              onAddManualSalt={() => openAddEditor("water_treatment")}
            />
            {items.length ? (
              <ul className="space-y-2 px-3 pb-3 sm:px-4 sm:pb-4">
                {items.map((ingredient) => (
                  <WaterTreatmentSectionRow
                    key={ingredient.localId}
                    ingredient={ingredient}
                    onEdit={(value) => maybeOpenEditor({
                      localId: value.localId,
                      category: value.category,
                      draft: { ...value },
                      initialSignature: serializeIngredient(value),
                      isExisting: true
                    })}
                    onDelete={deleteIngredient}
                    onQuantityChange={updateIngredientQuantity}
                  />
                ))}
              </ul>
            ) : null}
            <div className="px-3 pb-3 sm:px-4 sm:pb-4">
              <WaterSetupWizard
                variant="embedded"
                isOpen={waterSetupOpen}
                onIsOpenChange={setWaterSetupOpen}
                waterPlanMeta={waterPlanMeta}
                waterPlanResult={waterPlanResult}
                calculatedWaterPlanResult={calculatedWaterPlanResult}
                styleId={styleId.trim() || null}
                onChange={setWaterPlanMeta}
              />
            </div>
          </div>
        ),
      },
      {
        category: "consumable",
        title: "Другие добавки",
        subtitle: consumables.length ? `${consumables.length} поз.` : undefined,
        items: consumables,
        empty: "Irish Moss, Whirlfloc, нутриенты, цедру, специи и другие рецептные добавки можно держать здесь."
      }
    ];

  const editorFieldError = openEditor ? getIngredientDraftFieldError(openEditor.draft) : null;
  const editorPanel = openEditor ? (
    <IngredientEditor
      draft={openEditor.draft}
      isExisting={openEditor.isExisting}
      onChange={(next) => setOpenEditor((current) => current ? { ...current, draft: next } : current)}
      onSave={saveEditor}
      onCancel={() => closeEditor()}
      onDelete={openEditor.localId ? () => deleteIngredient(openEditor.localId!) : undefined}
      saveLabel={openEditor.localId ? "Сохранить позицию" : openEditor.category === "water_treatment" ? "Добавить соль" : "Добавить позицию"}
      fieldError={editorFieldError}
    />
  ) : null;

  const handlePublishClick = () => {
    setPublishError(null);
    if (!isPublishReady) {
      setReadinessDialogOpen(true);
      return;
    }

    setPublishConfirmOpen(true);
  };

  const handlePublishConfirm = async () => {
    setPublishError(null);
    const result = await persistRecipe({
      nextPublicationState: "published",
      surfaceInlineResult: false
    });

    if (result?.ok) {
      setPublishConfirmOpen(false);
      return;
    }

    if (result?.fieldErrors && Object.keys(result.fieldErrors).length) {
      setPublishConfirmOpen(false);
      setReadinessDialogOpen(true);
      return;
    }

    // Не-field ошибка (сеть/сервер): оставляем диалог открытым с текстом и
    // возможностью повторить — статус не врёт «опубликовано» (P0-2).
    setPublishError(result?.message ?? "Не удалось опубликовать — попробуйте ещё раз.");
  };

  const handleMakePrivateConfirm = async () => {
    setMakePrivateError(null);
    const result = await persistRecipe({
      nextPublicationState: "private",
      surfaceInlineResult: false
    });

    if (result?.ok) {
      setMakePrivateConfirmOpen(false);
      return;
    }

    setMakePrivateError(result?.message ?? "Не удалось изменить доступ — попробуйте ещё раз.");
  };

  const handleVersionChange = async (nextRecipeId: string) => {
    if (!nextRecipeId || nextRecipeId === activeRecipeId) {
      return;
    }

    // Сохраняем текущие правки перед навигацией к другой версии (#14),
    // как это делает handleCreateVersion — иначе несохранённое теряется молча.
    const saveBeforeSwitch = await persistRecipe({ surfaceInlineResult: true });
    if (saveBeforeSwitch && !saveBeforeSwitch.ok) {
      return;
    }

    startTransition(() => {
      router.push(buildRecipeEditHref(nextRecipeId));
    });
  };

  const handleCreateVersion = async () => {
    if (!activeRecipeId || pendingSave) {
      return;
    }

    const saveBeforeVersionResult = await persistRecipe({ surfaceInlineResult: true });
    if (saveBeforeVersionResult && !saveBeforeVersionResult.ok) {
      return;
    }

    setPendingSave(true);
    try {
      const result = await createRecipeVersionAction(activeRecipeId);

      if (!result.ok || !result.recipe) {
        setSaveResult(result);
        setSaveResultSignature(currentSignature);
        return;
      }

      const nextRecipe = result.recipe;
      startTransition(() => {
        router.push(buildRecipeEditHref(nextRecipe.id));
      });
    } catch {
      setSaveResult({ ok: false, message: "Не удалось создать версию — проверьте соединение." });
      setSaveResultSignature(currentSignature);
    } finally {
      setPendingSave(false);
    }
  };

  const runInventoryAction = async (action: "sync" | "reserve" | "consume" | "release") => {
    const saveBeforeInventoryResult = await persistRecipe({ surfaceInlineResult: true });
    if (saveBeforeInventoryResult && !saveBeforeInventoryResult.ok) {
      return;
    }

    const recipeId = saveBeforeInventoryResult?.recipe?.id ?? activeRecipeId;
    if (!recipeId) {
      return;
    }

    const actionMap: Record<typeof action, (recipeId: string) => Promise<RecipeInventoryActionResult>> = {
      sync: syncRecipeInventoryAllocationsAction,
      reserve: reserveRecipeInventoryAction,
      consume: consumeRecipeInventoryAction,
      release: releaseRecipeInventoryAction
    };

    setPendingSave(true);
    try {
      const result = await actionMap[action](recipeId);
      setSaveResult({
        ok: result.ok,
        message: result.message
      });
      setSaveResultSignature(currentSignature);

      if (result.coverage) {
        setStockCoverage(result.coverage);
        return;
      }

      const refreshed = await getRecipeStockCoverageAction(recipeId);
      if (refreshed.coverage) {
        setStockCoverage(refreshed.coverage);
      }
    } catch {
      setSaveResult({ ok: false, message: "Не удалось выполнить операцию со складом — проверьте соединение." });
      setSaveResultSignature(currentSignature);
    } finally {
      setPendingSave(false);
    }
  };

  const handleExportBeerXml = async (): Promise<ImportExportActionResult> => {
    const saveBeforeExportResult = await persistRecipe({ surfaceInlineResult: true });
    if (saveBeforeExportResult && !saveBeforeExportResult.ok) {
      return {
        ok: false,
        message: saveBeforeExportResult.message,
        fieldErrors: saveBeforeExportResult.fieldErrors
      };
    }

    const recipeId = saveBeforeExportResult?.recipe?.id ?? activeRecipeId;
    if (!recipeId) {
      return { ok: false, message: "Сначала сохраните рецепт, затем подготовьте экспорт." };
    }

    setPendingSave(true);
    try {
      const result = await exportRecipeBeerXmlAction(recipeId);
      setSaveResult({ ok: result.ok, message: result.message });
      setSaveResultSignature(currentSignature);

      if (result.ok && result.beerXml) {
        setBeerXmlExport(result.beerXml);
      }

      return { ok: result.ok, message: result.message };
    } finally {
      setPendingSave(false);
    }
  };

  const applyImportedRecipe = React.useCallback((recipe: RecipeDetailDto, message: string) => {
    const normalizedState = normalizeEditorPublicationState(recipe.publicationState);
    const nextIngredients = recipe.ingredients.map(toDesignerIngredient);
    const nextProcessMeta = cloneRecipeProcessMeta(recipe.processMeta);
    const nextCalculationMeta = cloneRecipeCalculationMeta(recipe.calculationMeta ?? null);
    const nextWaterPlanMeta = cloneRecipeWaterPlanMeta(recipe.waterPlanMeta ?? null);
    const nextEquipmentProfileSnapshot = cloneEquipmentProfileSnapshot(recipe.equipmentProfileSnapshot ?? null);
    const nextPayload = buildEditorPayloadFromRecipe(recipe, nextIngredients);
    const nextSignature = JSON.stringify(nextPayload);

    setActiveRecipeId(recipe.id);
    setActiveRecipeSlug(recipe.slug);
    setActiveVersionNumber(recipe.versionNumber);
    setRecipeVersions(recipe.versions);
    setTitle(recipe.title);
    setStyleId(recipe.styleId ?? "");
    setDescription(recipe.description ?? "");
    setAuthorNotes(recipe.authorNotes ?? "");
    setPublicationState(normalizedState);
    setSavedPublicationState(normalizedState);
    setBatchSize({
      quantity: String(recipe.batchSizeEnteredQuantity),
      unit: recipe.batchSizeEnteredUnit
    });
    setEfficiency(recipe.efficiency != null ? String(recipe.efficiency) : "");
    setBoilTimeMinutes(String(recipe.boilTimeMinutes));
    setProcessMeta(nextProcessMeta);
    setCalculationMeta(nextCalculationMeta);
    setWaterPlanMeta(nextWaterPlanMeta);
    setEquipmentProfileId(recipe.equipmentProfileId ?? null);
    setEquipmentProfileSnapshot(nextEquipmentProfileSnapshot);
    setIngredients(nextIngredients);
    setStockCoverage(null);
    setPreview(buildInitialPreview(recipe));
    setPreviewError(null);
    setBlockedSignature(null);
    setSavedSignature(nextSignature);
    setSaveResult({ ok: true, message });
    setSaveResultSignature(nextSignature);
    setOpenEditor(null);
    setImportExportOpen(false);
    onRecipeCreated?.(recipe);
    replaceRecipeEditorUrl(recipe.id);
  }, [onRecipeCreated]);

  const handleImportBeerXml = async (): Promise<RecipeEditorResult> => {
    const beerXml = beerXmlImport.trim();
    if (!beerXml) {
      return { ok: false, message: "Вставьте BeerXML или загрузите файл перед импортом." };
    }

    setPendingSave(true);
    try {
      const result = await importBeerXmlRecipeAction(beerXml);

      if (!result.ok || !result.recipe) {
        setSaveResult(result);
        setSaveResultSignature(currentSignature);
        return result;
      }

      applyImportedRecipe(result.recipe, result.message);

      return result;
    } finally {
      setPendingSave(false);
    }
  };

  const handleImportBrewfatherJson = async (): Promise<RecipeEditorResult> => {
    const json = brewfatherJsonImport.trim();
    if (!json) {
      return { ok: false, message: "Вставьте Brewfather JSON или загрузите файл перед импортом." };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      const result = { ok: false, message: "Brewfather JSON не удалось прочитать: проверьте синтаксис файла." };
      setSaveResult(result);
      setSaveResultSignature(currentSignature);
      return result;
    }

    setPendingSave(true);
    try {
      const result = await importBrewfatherJsonRecipeAction(parsed);

      if (!result.ok || !result.recipe) {
        setSaveResult(result);
        setSaveResultSignature(currentSignature);
        return result;
      }

      applyImportedRecipe(result.recipe, result.message);

      return result;
    } finally {
      setPendingSave(false);
    }
  };

  const handleCreateBrewBatch = async () => {
    const saveBeforeBatchResult = await persistRecipe({ surfaceInlineResult: true });
    if (saveBeforeBatchResult && !saveBeforeBatchResult.ok) {
      return;
    }

    const recipeId = saveBeforeBatchResult?.recipe?.id ?? activeRecipeId;
    if (!recipeId) {
      return;
    }

    setPendingSave(true);
    const result = await createBrewBatchFromRecipeAction(recipeId);
    setPendingSave(false);
    setSaveResult({ ok: result.ok, message: result.message });
    setSaveResultSignature(currentSignature);
  };

  const handleStartBrew = async ({ consumeIngredients }: { consumeIngredients: boolean }) => {
    setStartBrewResult(null);
    const saveBeforeBatchResult = await persistRecipe({ surfaceInlineResult: true });
    if (saveBeforeBatchResult && !saveBeforeBatchResult.ok) {
      setStartBrewResult({
        ok: false,
        message: saveBeforeBatchResult.message
      });
      return;
    }

    const recipeId = saveBeforeBatchResult?.recipe?.id ?? activeRecipeId;
    if (!recipeId) {
      setStartBrewResult({
        ok: false,
        message: "Сначала сохраните рецепт, затем начните варку."
      });
      return;
    }

    setPendingSave(true);
    try {
      // Сначала создаём партию, затем (опц.) списываем склад с привязкой к
      // brewBatchId — чтобы аудит и откат при отмене были привязаны к партии, а
      // не оставались «висящими» рецепт-скоупными транзакциями (brewBatchId=NULL).
      const batchResult = await createBrewBatchFromRecipeAction(recipeId);
      if (!batchResult.ok) {
        setStartBrewResult({ ok: false, message: batchResult.message });
        setSaveResult({ ok: false, message: batchResult.message });
        setSaveResultSignature(currentSignature);
        return;
      }

      let consumeNote = "";
      if (consumeIngredients) {
        const consumeResult = await consumeRecipeInventoryAction(recipeId, batchResult.brewBatchId ?? undefined);
        if (consumeResult.coverage) {
          setStockCoverage(consumeResult.coverage);
        }
        consumeNote = consumeResult.ok
          ? " Ингредиенты списаны со склада."
          : ` Партия создана, но списание не выполнено: ${consumeResult.message}`;
      }

      const nextResult = {
        ok: true,
        message: `Партия создана.${consumeNote}`,
        brewBatchId: batchResult.brewBatchId ?? null
      };
      setStartBrewResult(nextResult);
      setSaveResult({ ok: true, message: nextResult.message });
      setSaveResultSignature(currentSignature);
    } catch {
      const message = "Не удалось начать варку. Попробуйте еще раз.";
      setStartBrewResult({
        ok: false,
        message
      });
      setSaveResult({ ok: false, message });
      setSaveResultSignature(currentSignature);
    } finally {
      setPendingSave(false);
    }
  };

  // Гарантирует сохранённый рецепт и партию варки для запуска на устройстве.
  // Переиспользует штатный путь: persistRecipe → createBrewBatchFromRecipeAction
  // (тот же, что и в обычном «Начать варку»); привязку deviceId к партии делает
  // openSession внутри startBrewOnDevice.
  const ensureBrewBatchForDevice = async (): Promise<{ ok: boolean; brewBatchId: string | null; message: string }> => {
    const saveBeforeBatchResult = await persistRecipe({ surfaceInlineResult: true });
    if (saveBeforeBatchResult && !saveBeforeBatchResult.ok) {
      return { ok: false, brewBatchId: null, message: saveBeforeBatchResult.message };
    }

    const recipeId = saveBeforeBatchResult?.recipe?.id ?? activeRecipeId;
    if (!recipeId) {
      return { ok: false, brewBatchId: null, message: "Сначала сохраните рецепт, затем запустите варку." };
    }

    const batchResult = await createBrewBatchFromRecipeAction(recipeId);
    return {
      ok: batchResult.ok,
      brewBatchId: batchResult.brewBatchId ?? null,
      message: batchResult.message
    };
  };

  const handleRecipeCreatedFromImages = React.useCallback((recipe: RecipeDetailDto) => {
    const normalizedState = normalizeEditorPublicationState(recipe.publicationState);

    setActiveRecipeId(recipe.id);
    setActiveRecipeSlug(recipe.slug);
    setActiveVersionNumber(recipe.versionNumber);
    setRecipeVersions(recipe.versions);
    setSavedPublicationState(normalizedState);

    if (!title.trim()) {
      setTitle(recipe.title);
    }

    onRecipeCreated?.(recipe);
    replaceRecipeEditorUrl(recipe.id);
  }, [onRecipeCreated, title]);

  const headerSaveStatusMeta: { label: string; icon: React.ReactNode; className: string } = saveStatus === "saving"
    ? {
      label: "Сохранение…",
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      className: "bg-blue-50 text-blue-700 ring-blue-200"
    }
    : saveStatus === "error"
      ? {
        label: "Ошибка сохранения",
        icon: <CircleAlert className="h-3.5 w-3.5" />,
        className: "bg-rose-50 text-rose-700 ring-rose-200"
      }
      : {
        label: "Сохранено",
        icon: <CircleCheck className="h-3.5 w-3.5" />,
        className: "bg-emerald-50 text-emerald-700 ring-emerald-200"
      };

  const visibilityChipMeta = savedVisibility === "published"
    ? { label: "Опубликован", icon: <Globe className="h-3.5 w-3.5" />, className: "bg-violet-50 text-violet-700 ring-violet-200" }
    : { label: "Приватный", icon: <Lock className="h-3.5 w-3.5" />, className: "bg-zinc-100 text-zinc-700 ring-zinc-200" };

  // Компактные ключевые метрики для закреплённой полосы — петля «изменил → увидел»
  // не должна теряться при прокрутке длинной формы (#18/#20).
  const headerStyle = getBeerStyleById(styleId.trim() || "");
  const headerMetrics: Array<{ label: string; value: string }> = [
    { label: "НП", value: preview?.og != null ? preview.og.toFixed(3) : "—" },
    { label: "КП", value: preview?.fg != null ? preview.fg.toFixed(3) : "—" },
    { label: "ABV", value: preview?.abv != null ? `${preview.abv.toFixed(1)}%` : "—" },
    { label: "IBU", value: preview?.ibu != null ? preview.ibu.toFixed(0) : "—" },
    { label: "SRM", value: preview?.color != null ? preview.color.toFixed(1) : "—" }
  ];

  return (
    <div className="space-y-5">
      <ConfirmActionDialog
        open={waterResetConfirmOpen}
        title="Сбросить настройку воды?"
        description="Сбросятся источник, цель, объёмы, соли и pH. Действие нельзя отменить."
        confirmLabel="Сбросить"
        cancelLabel="Отмена"
        onConfirm={() => {
          resetWaterSetup();
          setWaterResetConfirmOpen(false);
        }}
        onClose={() => setWaterResetConfirmOpen(false)}
      />

      <div className="sticky top-14 z-30 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-200/70 bg-white/85 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-white/70 sm:px-5 lg:top-0">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${headerSaveStatusMeta.className}`}>
          {headerSaveStatusMeta.icon}
          <span className="hidden sm:inline">{headerSaveStatusMeta.label}</span>
        </span>

        <dl
          aria-busy={recalculating}
          className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums text-zinc-600 transition-opacity ${recalculating || previewError ? "opacity-50" : ""}`}
        >
          {headerMetrics.map((metric) => (
            <div key={metric.label} className="flex items-baseline gap-1">
              <dt className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">{metric.label}</dt>
              <dd className="font-semibold text-zinc-800">{metric.value}</dd>
            </div>
          ))}
          {headerStyle ? (
            <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200">
              {headerStyle.name}
            </span>
          ) : null}
        </dl>

        <div className="ml-auto flex items-center gap-1.5">
          {canManagePublication && savedVisibility === "published" && activeRecipeSlug ? (
            <a
              href={`/recipes/${activeRecipeSlug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 sm:text-sm"
              title="Открыть публичную страницу"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Публичная</span>
            </a>
          ) : null}
          {canManagePublication && savedVisibility === "private" ? (
            <button
              type="button"
              onClick={handlePublishClick}
              disabled={pendingSave}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-900 bg-zinc-900 px-3 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:text-sm"
            >
              <Globe className="h-3.5 w-3.5" />
              Опубликовать
            </button>
          ) : null}
          {canManagePublication && savedVisibility === "published" ? (
            <button
              type="button"
              onClick={() => {
                setMakePrivateError(null);
                setMakePrivateConfirmOpen(true);
              }}
              disabled={pendingSave}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
            >
              <Lock className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">В&nbsp;приватные</span>
              <span className="sm:hidden">Приватный</span>
            </button>
          ) : null}
          <RecipeActionsMenu
            pending={pendingSave}
            onOpenImportExport={() => setImportExportOpen(true)}
            onOpenStartBrew={() => {
              setStartBrewResult(null);
              setStartBrewOpen(true);
            }}
            onOpenBrewOnDevice={() => setBrewOnDeviceOpen(true)}
          />
        </div>
      </div>

      <section className="-mx-4 border-b border-zinc-200/70 bg-gradient-to-b from-white via-white to-zinc-50/50 px-4 py-4 sm:rounded-2xl sm:border sm:border-zinc-100 sm:bg-white sm:px-5 sm:py-5 sm:shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${visibilityChipMeta.className}`}>
            {visibilityChipMeta.icon}
            {visibilityChipMeta.label}
          </span>
          {activeRecipeId ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
              v{activeVersionNumber}
              <span className="text-zinc-400">• текущая</span>
            </span>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(240px,1fr)] md:items-start">
          <div className="min-w-0">
            <label htmlFor="recipe-title" className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Название рецепта
            </label>
            <input
              id="recipe-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-11 w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3.5 text-base font-semibold text-zinc-900 shadow-sm placeholder:font-normal placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 sm:text-lg"
              placeholder="Например, Tropical NEIPA"
            />
            {sectionErrors.title ? <p className="mt-1 text-xs text-rose-600">{sectionErrors.title}</p> : null}
          </div>
          <div className="min-w-0">
            <StylePicker id="recipe-style" value={styleId} onChange={setStyleId} className="min-w-0" />
            {sectionErrors.styleId ? <p className="mt-1 text-xs text-rose-600">{sectionErrors.styleId}</p> : null}
          </div>
        </div>

        {activeRecipeId ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 text-xs text-zinc-600">
            {recipeVersions.length > 1 ? (
              <label className="inline-flex items-center gap-1.5">
                <span className="text-zinc-500">Версия:</span>
                <select
                  value={activeRecipeId}
                  onChange={(event) => void handleVersionChange(event.target.value)}
                  className="h-8 min-w-[96px] rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-700 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-200"
                >
                  {recipeVersions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {`v${version.versionNumber}${version.id === activeRecipeId ? " • current" : ""}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="text-xs text-zinc-500">v{activeVersionNumber}</span>
            )}
            <button
              type="button"
              onClick={() => void handleCreateVersion()}
              disabled={pendingSave}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Новая версия
            </button>
          </div>
        ) : null}

        {visibleSaveResult && !visibleSaveResult.ok ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
            <CircleAlert className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">{visibleSaveResult.message}</span>
            {hasRetriableSaveError ? (
              <button
                type="button"
                onClick={() => void persistRecipe()}
                disabled={pendingSave}
                className="shrink-0 font-medium text-rose-700 underline decoration-rose-300 underline-offset-2 transition-colors hover:text-rose-900 disabled:opacity-60"
              >
                Повторить
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="grid items-start gap-4 lg:grid-cols-2">
        <RecipeBatchParametersBlock
          batchSize={batchSize}
          setBatchSize={setBatchSize}
          efficiency={efficiency}
          setEfficiency={setEfficiency}
          boilTimeMinutes={boilTimeMinutes}
          setBoilTimeMinutes={setBoilTimeMinutes}
          styleId={styleId.trim() || null}
          calculationMeta={calculationMeta}
          setCalculationMeta={setCalculationMeta}
          sectionErrors={sectionErrors}
          preview={preview}
          recalculating={recalculating}
          previewError={previewError}
          equipmentProfiles={equipmentProfiles}
          selectedEquipmentProfileId={equipmentProfileId}
          onSelectEquipmentProfile={handleSelectEquipmentProfile}
          onOpenBitternessSettings={() => setBitternessSettingsOpen(true)}
        />
        <RecipeStyleStatsBlock
          preview={preview}
          recalculating={recalculating}
          previewError={previewError}
        />
      </section>

      <div className="space-y-4">
        {sectionDefinitions.map((section) => {
          const IconComponent = categoryIcons[section.category];
          const iconBg = categoryIconBg[section.category];
          const itemCount = section.items.length;
          const hasError = Boolean(sectionErrors[`ingredients.${section.category}`]);
          const isWaterTreatmentSection = section.category === "water_treatment";
          const canAddToSection =
            section.category !== "hop" && !isWaterTreatmentSection;
          return (
            <section key={section.category} className={`overflow-hidden rounded-2xl border ${hasError ? "border-rose-200" : "border-zinc-200/70"} bg-white shadow-[0_1px_3px_0_rgb(0_0_0_/_0.04)]`}>
              <header className="flex items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-50/40 px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
                    <IconComponent className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <h2 className="truncate text-base font-semibold text-zinc-950">{section.title}</h2>
                      {section.subtitle ? <span className="text-sm tabular-nums text-zinc-400">({section.subtitle})</span> : null}
                    </div>
                    {hasError ? <p className="mt-0.5 text-xs text-rose-700">{sectionErrors[`ingredients.${section.category}`]}</p> : null}
                  </div>
                </div>
                {section.category !== "hop" ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isWaterTreatmentSection ? (
                      <>
                        <button
                          type="button"
                          onClick={waterSetupOpen ? closeWaterSetup : openWaterSetup}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 sm:h-9 sm:px-3 sm:text-sm"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">
                            {getRecipeWaterSetupToggleLabel(waterSetupOpen)}
                          </span>
                          <span className="sm:hidden">
                            {waterSetupOpen ? "Скрыть" : "Вода"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setWaterResetConfirmOpen(true)}
                          disabled={!waterPlanMeta.setupEnabled}
                          className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-500 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:px-3 sm:text-sm"
                        >
                          <span className="hidden sm:inline">Сбросить воду</span>
                          <span className="sm:hidden">Сброс</span>
                        </button>
                      </>
                    ) : null}
                    {canAddToSection ? (
                      <button
                        type="button"
                        onClick={() => openAddEditor(section.category)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 sm:h-9 sm:px-3 sm:text-sm"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">
                          Добавить
                        </span>
                        <span className="sm:hidden">
                          Добавить
                        </span>
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </header>

              <div className="p-3 sm:p-4">
                {section.renderItems ? (
                  section.renderItems(section.items)
                ) : section.items.length ? (
                  <ul className="space-y-2">
                    {section.items.map((ingredient) => (
                      <SectionRow
                        key={ingredient.localId}
                        ingredient={ingredient}
                        percentage={section.category === "fermentable" ? getFermentablePercentage(ingredient, fermentableTotalKg) : null}
                        onEdit={(value) => maybeOpenEditor({
                          localId: value.localId,
                          category: value.category,
                          draft: { ...value },
                          initialSignature: serializeIngredient(value),
                          isExisting: true
                        })}
                        onDelete={deleteIngredient}
                        onQuantityChange={updateIngredientQuantity}
                        onTimeChange={updateHopTimeMinutes}
                        onAddImportedAsCustom={addImportedIngredientAsCustom}
                        onMapImportedSource={openImportedCatalogMatcher}
                      />
                    ))}
                  </ul>
                ) : (
                  <button
                    type="button"
                    onClick={() => section.category !== "hop" ? openAddEditor(section.category) : undefined}
                    disabled={section.category === "hop"}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/40 px-4 py-6 text-sm text-zinc-500 transition-colors hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-700 disabled:cursor-default disabled:hover:border-zinc-300 disabled:hover:bg-zinc-50/40 disabled:hover:text-zinc-500"
                  >
                    {section.category !== "hop" ? <Plus className="h-4 w-4" /> : null}
                    <span>{section.empty}</span>
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="space-y-2">
        <RecipeProfiles processMeta={processMeta} onChange={setProcessMeta} />
        {sectionErrors["processMeta.mashProfile.steps"] ? (
          <p className="text-xs text-rose-700">{sectionErrors["processMeta.mashProfile.steps"]}</p>
        ) : null}
        {sectionErrors["processMeta.fermentationProfile"] ? (
          <p className="text-xs text-rose-700">{sectionErrors["processMeta.fermentationProfile"]}</p>
        ) : null}
      </div>

      <StockCoverageSummary
        coverage={stockCoverage}
        pending={pendingSave}
        activeRecipeId={activeRecipeId}
        onAction={(action) => void runInventoryAction(action)}
      />

      <section className="space-y-4">
        <RecipeImagesSection
          recipeId={activeRecipeId}
          recipeTitle={title}
          initialImages={initialImages}
          draftSeed={payload}
          onRecipeCreated={handleRecipeCreatedFromImages}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <details className="group overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-[0_1px_3px_0_rgb(0_0_0_/_0.04)]" open>
            <summary className="flex cursor-pointer list-none items-center gap-2.5 border-b border-transparent bg-zinc-50/40 px-4 py-3 text-sm font-semibold text-zinc-800 group-open:border-zinc-100">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                <FileText className="h-4 w-4" />
              </div>
              <span className="text-[15px]">Описание рецепта</span>
              <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">публично</span>
              <ChevronRight className="ml-auto h-4 w-4 text-zinc-400 transition-transform group-open:rotate-90" />
            </summary>
            <div className="p-4">
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-28 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-200"
                placeholder="Публичное описание рецепта — что это за пиво, вдохновение, особенности…"
              />
              {sectionErrors.description ? <p className="mt-2 text-xs text-rose-700">{sectionErrors.description}</p> : null}
            </div>
          </details>
          <details className="group overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-[0_1px_3px_0_rgb(0_0_0_/_0.04)]" open>
            <summary className="flex cursor-pointer list-none items-center gap-2.5 border-b border-transparent bg-zinc-50/40 px-4 py-3 text-sm font-semibold text-zinc-800 group-open:border-zinc-100">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <StickyNote className="h-4 w-4" />
              </div>
              <span className="text-[15px]">Личные заметки</span>
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                <Lock className="h-3 w-3" />
                приватно
              </span>
              <ChevronRight className="ml-auto h-4 w-4 text-zinc-400 transition-transform group-open:rotate-90" />
            </summary>
            <div className="p-4">
              <textarea
                value={authorNotes}
                onChange={(event) => setAuthorNotes(event.target.value)}
                className="min-h-28 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-200"
                placeholder="Видны только вам — TODO, лоты, наблюдения с прошлых варок…"
              />
            </div>
          </details>
        </div>
      </section>

      <ConfirmActionDialog
        open={publishConfirmOpen}
        title="Опубликовать рецепт?"
        description="После публикации он станет доступен по публичной ссылке."
        confirmLabel="Опубликовать"
        pendingLabel="Публикуем..."
        tone="primary"
        pending={pendingSave}
        error={publishError}
        onConfirm={() => void handlePublishConfirm()}
        onClose={() => {
          setPublishConfirmOpen(false);
          setPublishError(null);
        }}
      />

      <ConfirmActionDialog
        open={makePrivateConfirmOpen}
        title="Сделать рецепт приватным?"
        description="После этого публичная страница перестанет быть доступна."
        confirmLabel="Сделать приватным"
        pendingLabel="Меняем доступ..."
        pending={pendingSave}
        error={makePrivateError}
        onConfirm={() => void handleMakePrivateConfirm()}
        onClose={() => {
          setMakePrivateConfirmOpen(false);
          setMakePrivateError(null);
        }}
      />

      <PublicationReadinessDialog
        open={readinessDialogOpen}
        checklist={publishChecklist}
        onClose={() => setReadinessDialogOpen(false)}
      />

      <BitternessSettingsDrawer
        open={bitternessSettingsOpen}
        calculationMeta={calculationMeta}
        onChange={setCalculationMeta}
        onClose={() => setBitternessSettingsOpen(false)}
      />

      <ImportExportModal
        open={importExportOpen}
        pending={pendingSave}
        activeRecipeId={activeRecipeId}
        beerXmlExport={beerXmlExport}
        beerXmlImport={beerXmlImport}
        brewfatherJsonImport={brewfatherJsonImport}
        onBeerXmlImportChange={setBeerXmlImport}
        onBrewfatherJsonImportChange={setBrewfatherJsonImport}
        onExportBeerXml={handleExportBeerXml}
        onImportBeerXml={handleImportBeerXml}
        onImportBrewfatherJson={handleImportBrewfatherJson}
        onClose={() => setImportExportOpen(false)}
      />

      <StartBrewModal
        open={startBrewOpen}
        pending={pendingSave}
        result={startBrewResult}
        onStart={(options) => void handleStartBrew(options)}
        onClose={() => setStartBrewOpen(false)}
      />

      <BrewOnDeviceModal
        open={brewOnDeviceOpen}
        pending={pendingSave}
        ensureBrewBatch={ensureBrewBatchForDevice}
        onClose={() => setBrewOnDeviceOpen(false)}
      />

      <IngredientAddDrawer open={Boolean(openEditor)} isMobile={isMobile} onClose={() => closeEditor()}>
        {editorPanel}
      </IngredientAddDrawer>
    </div>
  );
}
