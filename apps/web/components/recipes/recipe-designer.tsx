"use client";

import { beerStyleFixtures, convertWeight, evaluateStyleFit, getBeerStyleById, getStyleRangeById, sgToPlato } from "@nb/brewing-core";
import {
  CircleCheck,
  CircleAlert,
  ChevronRight,
  Droplets,
  FileText,
  FlaskConical,
  Hop,
  Package,
  Pencil,
  StickyNote,
  Target,
  Thermometer,
  Timer,
  Wheat
} from "lucide-react";
import React, { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import {
  createRecipeCustomIngredientAction,
  createRecipeAction,
  createRecipeVersionAction,
  previewRecipeDraftAction,
  proposeRecipeIngredientAction,
  updateRecipeAction,
  type RecipeEditorPayload,
  type RecipeEditorResult
} from "@/app/(app)/app/recipes/actions";
import { IngredientPicker } from "@/components/ingredients/ingredient-picker";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import type { IngredientCategory, IngredientSuggestionItem, IngredientSubtype, IngredientType } from "@/features/ingredients/contracts";
import { ingredientCategoryLabels } from "@/features/ingredients/presentation";
import { resolveIngredientCategory, resolveLegacyIngredientType } from "@/features/ingredients/taxonomy";
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
  recipeFermentableUseTypes,
  recipeHopUseTypes,
  type RecipeDetailDto,
  type RecipeDraftPreviewDto,
  type RecipeHopUseType,
  type RecipeProcessMeta,
  type RecipePublicationState
} from "@/features/recipes/contracts";
import { beerColorFromSrm } from "@/features/recipes/beer-color";
import { formatColorWithEbc, formatGravityWithPlato } from "@/features/recipes/format";
import { BeerGlassIcon } from "@/components/recipes/beer-glass-icon";
import {
  buildRecipePublicationChecklist,
  getRecipePublicationFieldErrors
} from "@/features/recipes/publication-validation";
import { globalBrewingRanges } from "@/features/recipes/style-ranges";

type Props = {
  mode: "create" | "edit";
  initialRecipe?: RecipeDetailDto;
  initialTitle?: string;
  onSaveStatusChange?: (status: RecipeSaveStatus) => void;
  onRecipeCreated?: (recipe: RecipeDetailDto) => void;
  onPublicationStateChange?: (state: RecipePublicationState) => void;
};

export type RecipeSaveStatus = "saved" | "saving" | "error";

type DesignerIngredient = {
  localId: string;
  ingredientCatalogItemId: string | null;
  userCustomIngredientId: string | null;
  selectedName: string;
  selectedSummary: string;
  familyDisplayName: string;
  category: IngredientCategory;
  subtype: IngredientSubtype | null;
  familyId: string | null;
  type: IngredientType;
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
  whirlpool: "Whirlpool / Hopstand",
  dry_hop: "Dry Hop",
  dip_hop: "Dip Hop",
  other: "Другое"
};

const stageLabels: Record<DesignerIngredient["stage"], string> = {
  mash: "Затор",
  boil: "Кипячение",
  whirlpool: "Whirlpool",
  fermentation: "Ферментация",
  packaging: "Розлив",
  other: "Другое"
};

const fermentableUseLabels: Record<(typeof recipeFermentableUseTypes)[number], string> = {
  mash: "Затор",
  steep: "Настой",
  boil: "Кипячение"
};

const createLocalId = () => (
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

const DEFAULT_BATCH_SIZE_ENTERED_QUANTITY = 20;
const DEFAULT_BATCH_SIZE_ENTERED_UNIT: InventoryUnit = "l";
const DEFAULT_BOIL_TIME_MINUTES = 60;

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

const toPositiveNumberOrDefault = (value: number, fallback: number) => (
  Number.isFinite(value) && value > 0 ? value : fallback
);

const normalizeSavePayload = (payload: RecipeEditorPayload): RecipeEditorPayload => ({
  ...payload,
  batchSizeEnteredQuantity: toPositiveNumberOrDefault(payload.batchSizeEnteredQuantity, DEFAULT_BATCH_SIZE_ENTERED_QUANTITY),
  batchSizeEnteredUnit: payload.batchSizeEnteredUnit || DEFAULT_BATCH_SIZE_ENTERED_UNIT,
  boilTimeMinutes: Number.isInteger(payload.boilTimeMinutes) && payload.boilTimeMinutes > 0
    ? payload.boilTimeMinutes
    : DEFAULT_BOIL_TIME_MINUTES
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
  if (useType === "boil") return "boil";
  if (useType === "whirlpool") return "whirlpool";
  if (useType === "dry_hop") return "fermentation";
  return "other";
};

const createEmptyIngredient = (category: IngredientCategory, hopUseType: RecipeHopUseType = "boil"): DesignerIngredient => {
  const unitProfile = resolveHumanFacingInventoryUnitProfile({ category });

  if (category === "hop") {
    return {
      localId: createLocalId(),
      ingredientCatalogItemId: null,
      userCustomIngredientId: null,
      selectedName: "",
      selectedSummary: "",
      familyDisplayName: "",
      category,
      subtype: null,
      familyId: null,
      type: resolveLegacyIngredientType({ category }) ?? "hop",
      defaultDisplayUnit: unitProfile.defaultUnit,
      allowedUnits: unitProfile.allowedUnits,
      measurementDimension: unitProfile.measurementDimension,
      amountEnteredQuantity: "",
      amountEnteredUnit: unitProfile.defaultUnit,
      stage: mapHopStageFromUseType(hopUseType),
      timeOffset: "",
      stepMeta: {
        useType: hopUseType,
        timeMinutes: hopUseType === "boil" || hopUseType === "whirlpool" || hopUseType === "dip_hop" ? "" : undefined,
        temperatureC: hopUseType === "whirlpool" || hopUseType === "dip_hop" ? "" : undefined,
        durationDays: hopUseType === "dry_hop" ? "" : undefined
      }
    };
  }

  if (category === "fermentable") {
    return {
      localId: createLocalId(),
      ingredientCatalogItemId: null,
      userCustomIngredientId: null,
      selectedName: "",
      selectedSummary: "",
      familyDisplayName: "",
      category,
      subtype: null,
      familyId: null,
      type: resolveLegacyIngredientType({ category }) ?? "fermentable",
      defaultDisplayUnit: unitProfile.defaultUnit,
      allowedUnits: unitProfile.allowedUnits,
      measurementDimension: unitProfile.measurementDimension,
      amountEnteredQuantity: "",
      amountEnteredUnit: unitProfile.defaultUnit,
      stage: "mash",
      timeOffset: "",
      stepMeta: {
        use: "mash"
      }
    };
  }

  return {
    localId: createLocalId(),
    ingredientCatalogItemId: null,
    userCustomIngredientId: null,
    selectedName: "",
    selectedSummary: "",
    familyDisplayName: "",
    category,
    subtype: null,
    familyId: null,
    type: resolveLegacyIngredientType({ category }) ?? "misc",
    defaultDisplayUnit: unitProfile.defaultUnit,
    allowedUnits: unitProfile.allowedUnits,
    measurementDimension: unitProfile.measurementDimension,
    amountEnteredQuantity: "",
    amountEnteredUnit: unitProfile.defaultUnit,
    stage: category === "yeast" ? "fermentation" : "other",
    timeOffset: "",
    stepMeta: {}
  };
};

const applySelection = (current: DesignerIngredient, item: IngredientSuggestionItem): DesignerIngredient => {
  const unitProfile = resolveHumanFacingInventoryUnitProfile({
    type: item.type,
    category: item.category ?? current.category,
    subtype: item.subtype ?? null,
    defaultDisplayUnit: item.defaultDisplayUnit ?? item.defaultUnit,
    allowedUnits: item.allowedUnits,
    measurementDimension: item.measurementDimension
  });

  return {
    ...current,
    ingredientCatalogItemId: item.source === "catalog" ? item.id : null,
    userCustomIngredientId: item.source === "custom" ? item.id : null,
    selectedName: item.displayName,
    selectedSummary: item.subtitle ?? "",
    familyDisplayName: item.familyDisplayName ?? "",
    category: item.category ?? current.category,
    subtype: item.subtype ?? null,
    familyId: item.familyId ?? null,
    type: item.type,
    defaultDisplayUnit: unitProfile.defaultUnit,
    allowedUnits: unitProfile.allowedUnits,
    measurementDimension: unitProfile.measurementDimension,
    amountEnteredUnit: unitProfile.defaultUnit
  };
};

const applyQueryChange = (current: DesignerIngredient, nextValue: string): DesignerIngredient => {
  if (!current.ingredientCatalogItemId && !current.userCustomIngredientId) {
    return { ...current, selectedName: nextValue };
  }

  const unitProfile = resolveHumanFacingInventoryUnitProfile({ category: current.category });
  return {
    ...current,
    ingredientCatalogItemId: null,
    userCustomIngredientId: null,
    selectedName: nextValue,
    selectedSummary: "",
    familyDisplayName: "",
    subtype: null,
    familyId: null,
    defaultDisplayUnit: unitProfile.defaultUnit,
    allowedUnits: unitProfile.allowedUnits,
    measurementDimension: unitProfile.measurementDimension,
    amountEnteredUnit: unitProfile.defaultUnit
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
    stepMeta: Object.keys(stepMeta).length ? stepMeta : null
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

  return {
    localId: ingredient.id,
    ingredientCatalogItemId: ingredient.ingredientCatalogItemId,
    userCustomIngredientId: ingredient.userCustomIngredientId,
    selectedName: ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameSnapshot ?? "",
    selectedSummary: ingredient.ingredientSummary ?? "",
    familyDisplayName: ingredient.ingredientFamilyDisplayName ?? "",
    category,
    subtype: ingredient.ingredientSubtype ?? null,
    familyId: ingredient.ingredientFamilyId ?? null,
    type: ingredient.type,
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
    }
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
    abv: recipe.abv,
    ibu: recipe.ibu,
    color: recipe.color,
    styleId: recipe.styleId,
    styleRange,
    styleFit
  };
};

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
    if (useType === "boil" || useType === "whirlpool" || useType === "dip_hop") {
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

  if ((ingredient.category === "water_prep" || ingredient.category === "misc") && ingredient.stage !== "other") {
    details.push(stageLabels[ingredient.stage]);
  }

  if (ingredient.category === "misc" && ingredient.stepMeta.timeMinutes) {
    details.push(`${ingredient.stepMeta.timeMinutes} мин`);
  }

  if (ingredient.stepMeta.stageLabel?.trim()) {
    details.push(ingredient.stepMeta.stageLabel.trim());
  }

  return details.join(" • ");
};

const getQuantityText = (ingredient: DesignerIngredient) => `${ingredient.amountEnteredQuantity || "—"} ${inventoryUnitLabels[ingredient.amountEnteredUnit] ?? ingredient.amountEnteredUnit}`;

const getSectionTitle = (category: IngredientCategory) => {
  if (category === "fermentable") return "Сбраживаемое";
  if (category === "hop") return "Хмель";
  if (category === "yeast") return "Дрожжи";
  if (category === "water_prep") return "Водоподготовка";
  return "Прочее";
};

const categoryIcons: Record<IngredientCategory, React.ComponentType<{ className?: string }>> = {
  fermentable: Wheat,
  hop: Hop,
  yeast: FlaskConical,
  water_prep: Droplets,
  misc: Package
};

const categoryAccentBorder: Record<IngredientCategory, string> = {
  fermentable: "border-l-amber-400",
  hop: "border-l-emerald-500",
  yeast: "border-l-violet-400",
  water_prep: "border-l-sky-400",
  misc: "border-l-zinc-300"
};

const categoryIconBg: Record<IngredientCategory, string> = {
  fermentable: "bg-amber-50 text-amber-600",
  hop: "bg-emerald-50 text-emerald-600",
  yeast: "bg-violet-50 text-violet-600",
  water_prep: "bg-sky-50 text-sky-600",
  misc: "bg-zinc-100 text-zinc-500"
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

const getIngredientWeightKg = (ingredient: DesignerIngredient): number => {
  const quantity = Number(ingredient.amountEnteredQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  if (!["g", "kg", "oz", "lb"].includes(ingredient.amountEnteredUnit)) return 0;
  return convertWeight({ value: quantity, unit: ingredient.amountEnteredUnit as "g" | "kg" | "oz" | "lb" }, "kg").value;
};

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

const isIngredientValid = (ingredient: DesignerIngredient) => {
  if (!ingredient.ingredientCatalogItemId && !ingredient.userCustomIngredientId) {
    return false;
  }

  const quantity = Number(ingredient.amountEnteredQuantity);
  return Number.isFinite(quantity) && quantity > 0;
};

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const getMetricPositionPercent = (value: number | null, min: number, max: number) => {
  if (value == null || max <= min) {
    return null;
  }

  return clampPercent(((value - min) / (max - min)) * 100);
};

const getMetricStatusAppearance = (status: "in_range" | "below" | "above" | null) => {
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
      badgeClassName: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
      needleClassName: "bg-amber-500",
      needleDotClassName: "bg-amber-500 ring-2 ring-white shadow"
    };
  }

  if (status === "above") {
    return {
      label: "Выше",
      badgeClassName: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
      needleClassName: "bg-rose-500",
      needleDotClassName: "bg-rose-500 ring-2 ring-white shadow"
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

    return beerStyleFixtures.filter((style) => {
      const haystack = `${style.id} ${style.bjcpId} ${style.name} ${style.family ?? ""}`.toLowerCase();
      return haystack.includes(normalized);
    });
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
        autoFocus
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
          <span>Без выбранного стиля</span>
          {!selectedStyle ? <span className="text-[11px] text-zinc-500">активно</span> : null}
        </button>

        {filteredStyles.length ? (
          filteredStyles.map((style) => (
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
                <div className="truncate text-sm font-medium text-zinc-900">{style.name}</div>
                <div className="text-xs text-zinc-500">
                  {style.family ? `${style.bjcpId} • ${style.family}` : style.bjcpId}
                </div>
              </div>
              {value === style.id ? <span className="text-[11px] text-zinc-500">выбран</span> : null}
            </button>
          ))
        ) : (
          <div className="px-3 py-4 text-sm text-zinc-500">Ничего не найдено.</div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={`relative ${className ?? "min-w-[280px] shrink-0"}`}>
      <label id={labelId} htmlFor={id} className="mb-1 block text-[11px] font-medium text-zinc-600">
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
          {selectedStyle ? selectedStyle.name : "Выбрать стиль"}
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
  valueLabel
}: {
  actualValue: number | null;
  globalRange: { min: number; max: number };
  styleRange: { min: number; max: number } | null;
  status: "in_range" | "below" | "above" | null;
  valueLabel: string;
}) {
  const appearance = getMetricStatusAppearance(status);
  const valuePercent = getMetricPositionPercent(actualValue, globalRange.min, globalRange.max);

  const bandLeft = styleRange ? clampPercent(((styleRange.min - globalRange.min) / (globalRange.max - globalRange.min)) * 100) : null;
  const bandRight = styleRange ? clampPercent(((styleRange.max - globalRange.min) / (globalRange.max - globalRange.min)) * 100) : null;
  const bandWidth = bandLeft != null && bandRight != null ? bandRight - bandLeft : null;

  if (valuePercent == null && bandLeft == null) {
    return <div className="flex h-5 items-center text-[11px] text-zinc-400">Нет данных</div>;
  }

  return (
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
  );
}

const formatGravityPlato = (sg: number | null) => {
  if (sg == null) return "—";
  return `${sgToPlato(sg, 1).toFixed(1)} °P`;
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
  const hasStyleRange = Boolean(preview?.styleRange);
  const hasCalculatedMetrics = [preview?.og, preview?.fg, preview?.abv, preview?.ibu, preview?.color].some((value) => value != null);
  const styleRange = preview?.styleRange ?? null;
  const fit = preview?.styleFit;
  const styleName = styleRange?.name ?? null;

  const items = [
    {
      label: "OG",
      valueLabel: preview?.og != null ? `${preview.og.toFixed(3)} · ${formatGravityPlato(preview.og)}` : "—",
      actualValue: preview?.og ?? null,
      globalRange: globalBrewingRanges.og,
      styleRange: styleRange?.og ?? null,
      globalMinLabel: globalBrewingRanges.og.min.toFixed(3),
      globalMaxLabel: globalBrewingRanges.og.max.toFixed(3),
      status: hasStyleRange && preview?.og != null ? fit?.og.status ?? null : null
    },
    {
      label: "FG",
      valueLabel: preview?.fg != null ? `${preview.fg.toFixed(3)} · ${formatGravityPlato(preview.fg)}` : "—",
      actualValue: preview?.fg ?? null,
      globalRange: globalBrewingRanges.fg,
      styleRange: styleRange?.fg ?? null,
      globalMinLabel: globalBrewingRanges.fg.min.toFixed(3),
      globalMaxLabel: globalBrewingRanges.fg.max.toFixed(3),
      status: hasStyleRange && preview?.fg != null ? fit?.fg.status ?? null : null
    },
    {
      label: "ABV",
      valueLabel: preview?.abv != null ? `${preview.abv.toFixed(1)}%` : "—",
      actualValue: preview?.abv ?? null,
      globalRange: globalBrewingRanges.abv,
      styleRange: styleRange?.abv ?? null,
      globalMinLabel: `${globalBrewingRanges.abv.min.toFixed(0)}%`,
      globalMaxLabel: `${globalBrewingRanges.abv.max.toFixed(0)}%`,
      status: hasStyleRange && preview?.abv != null ? fit?.abv.status ?? null : null
    },
    {
      label: "IBU",
      valueLabel: preview?.ibu != null ? `${preview.ibu.toFixed(0)}` : "—",
      actualValue: preview?.ibu ?? null,
      globalRange: globalBrewingRanges.ibu,
      styleRange: styleRange?.ibu ?? null,
      globalMinLabel: `${globalBrewingRanges.ibu.min.toFixed(0)}`,
      globalMaxLabel: `${globalBrewingRanges.ibu.max.toFixed(0)}`,
      status: hasStyleRange && preview?.ibu != null ? fit?.ibu.status ?? null : null
    },
    {
      label: "Color",
      valueLabel: preview?.color != null ? formatColorWithEbc(preview.color) : "—",
      actualValue: preview?.color ?? null,
      globalRange: globalBrewingRanges.colorSrm,
      styleRange: styleRange?.colorSrm ?? null,
      globalMinLabel: `${globalBrewingRanges.colorSrm.min.toFixed(0)}`,
      globalMaxLabel: `${globalBrewingRanges.colorSrm.max.toFixed(0)}`,
      status: hasStyleRange && preview?.color != null ? fit?.colorSrm.status ?? null : null
    }
  ];

  const overallFit = items.some((item) => item.actualValue != null) &&
    items.every((item) => item.actualValue == null || item.status === "in_range");

  return (
    <section className="flex h-full flex-col rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-900">
            {styleName ? `Ваш рецепт и BJCP ${styleName}` : "Расчёт показателей"}
          </h2>
          {hasStyleRange && hasCalculatedMetrics ? (
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${overallFit ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"}`}>
              {overallFit ? <CircleCheck className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}
              {overallFit ? "В стиле" : "Отклонения"}
            </span>
          ) : null}
          {recalculating ? (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
              Пересчёт...
            </span>
          ) : null}
        </div>
        {previewError ? <p className="text-xs text-rose-500">{previewError}</p> : null}
      </div>

      <div className="-mx-1 flex-1">
        {items.map((item) => {
          const appearance = getMetricStatusAppearance(item.status);

          return (
            <div key={item.label} className="group grid items-center gap-x-2 rounded-lg px-1 py-1 transition-colors hover:bg-zinc-50 sm:grid-cols-[36px_minmax(0,1fr)_60px]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{item.label}</div>
              <div>
                <StyleRangeTrack
                  actualValue={item.actualValue}
                  globalRange={item.globalRange}
                  styleRange={item.styleRange}
                  status={item.status}
                  valueLabel={item.valueLabel}
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

function RecipeBatchParametersBlock({
  batchSize,
  setBatchSize,
  efficiency,
  setEfficiency,
  boilTimeMinutes,
  setBoilTimeMinutes,
  sectionErrors,
  preview
}: {
  batchSize: { quantity: string; unit: InventoryUnit };
  setBatchSize: React.Dispatch<React.SetStateAction<{ quantity: string; unit: InventoryUnit }>>;
  efficiency: string;
  setEfficiency: React.Dispatch<React.SetStateAction<string>>;
  boilTimeMinutes: string;
  setBoilTimeMinutes: React.Dispatch<React.SetStateAction<string>>;
  sectionErrors: Record<string, string>;
  preview: RecipeDraftPreviewDto | null;
}) {
  const summaryItems = [
    { label: "Цвет", value: preview?.color != null ? formatColorWithEbc(preview.color) : "—" },
    { label: "OG", value: formatGravityWithPlato(preview?.og ?? null) },
    { label: "FG", value: formatGravityWithPlato(preview?.fg ?? null) },
    { label: "IBU", value: preview?.ibu != null ? `${preview.ibu.toFixed(0)}` : "—" },
    { label: "ABV", value: preview?.abv != null ? `${preview.abv.toFixed(1)}%` : "—" },
    {
      label: "Стиль",
      value: preview?.styleRange?.name ?? "Без BJCP"
    }
  ];

  return (
    <div className="flex h-full flex-col rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-zinc-700">Параметры партии</h3>
      </div>

      <dl className="mb-4 grid grid-cols-2 gap-2 xl:grid-cols-3">
        {summaryItems.map((item) => {
          const colorInfo = item.label === "Цвет" && preview?.color != null ? beerColorFromSrm(preview.color) : null;

          return (
            <div
              key={item.label}
              className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5"
            >
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">
                {item.label}
              </dt>
              {colorInfo ? (
                <dd className="mt-1 flex items-center gap-2">
                  <BeerGlassIcon color={colorInfo.hex} size={26} className="shrink-0 text-zinc-300" />
                  <div>
                    <div className="whitespace-nowrap text-base font-semibold tabular-nums text-zinc-950">{item.value}</div>
                    <div className="text-[10px] font-medium text-zinc-400">{colorInfo.label}</div>
                  </div>
                </dd>
              ) : (
                <dd className="mt-1 whitespace-nowrap text-base font-semibold tabular-nums text-zinc-950">
                  {item.value}
                </dd>
              )}
            </div>
          );
        })}
      </dl>

      <div className="mt-auto">
        <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <label className="space-y-1 text-[11px] font-medium text-zinc-500">
            Объём
            <div className="relative">
              <input type="number" min={0.1} step={0.1} value={batchSize.quantity} onChange={(event) => setBatchSize((current) => ({ ...current, quantity: event.target.value }))} className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 pr-10 text-sm tabular-nums text-zinc-900 shadow-sm" />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-zinc-400">
                л
              </span>
            </div>
          </label>
          <label className="space-y-1 text-[11px] font-medium text-zinc-500">
            Эффективность, %
            <input type="number" min={1} max={100} value={efficiency} onChange={(event) => setEfficiency(event.target.value)} className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums text-zinc-900 shadow-sm" />
          </label>
          <label className="space-y-1 text-[11px] font-medium text-zinc-500">
            Кипячение, мин
            <input type="number" min={1} value={boilTimeMinutes} onChange={(event) => setBoilTimeMinutes(event.target.value)} className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm tabular-nums text-zinc-900 shadow-sm" />
            {sectionErrors.boilTimeMinutes ? <span className="block text-xs text-rose-600">{sectionErrors.boilTimeMinutes}</span> : null}
          </label>
        </div>
      </div>
    </div>
  );
}

function SectionRow({
  ingredient,
  onEdit,
  onDelete,
  onQuantityChange,
  onTimeChange,
  percentage
}: {
  ingredient: DesignerIngredient;
  onEdit: (ingredient: DesignerIngredient) => void;
  onDelete: (localId: string) => void;
  onQuantityChange: (localId: string, quantity: string) => void;
  onTimeChange: (localId: string, timeMinutes: string) => void;
  percentage?: number | null;
}) {
  const accent = categoryAccentBorder[ingredient.category];
  const unitLabel = inventoryUnitLabels[ingredient.amountEnteredUnit] ?? ingredient.amountEnteredUnit;
  const hopUseType = ingredient.category === "hop" ? getHopUseType(ingredient) : null;
  const hasInlineTimeControl = hopUseType === "boil" || hopUseType === "whirlpool" || hopUseType === "dip_hop";

  return (
    <li className={`rounded-lg border-l-[3px] bg-white px-3 py-2.5 shadow-sm ring-1 ring-zinc-100 transition-shadow hover:shadow-md ${accent}`}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-zinc-950">{ingredient.selectedName || "Не выбран"}</span>
            {percentage != null && percentage > 0 ? (
              <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-amber-700">{percentage.toFixed(1)}%</span>
            ) : null}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">{buildSummaryDetails(ingredient) || ingredient.selectedSummary || ingredient.familyDisplayName || "—"}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <input
            type="number"
            value={ingredient.amountEnteredQuantity}
            onChange={(event) => onQuantityChange(ingredient.localId, event.target.value)}
            className="h-7 w-[72px] rounded-md border border-zinc-200 bg-zinc-50 px-2 text-right text-sm tabular-nums text-zinc-900 focus:border-zinc-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-200"
            min={0}
            step="any"
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
              step={1}
            />
            <span className="text-xs text-zinc-500">мин</span>
          </div>
        ) : null}
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={() => onEdit(ingredient)} className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => onDelete(ingredient.localId)} className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600">
            <span className="text-xs font-medium">✕</span>
          </button>
        </div>
      </div>
    </li>
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
                  disabled={processMeta.mashProfile.steps.length === 1}
                  onClick={() => onChange({
                    ...processMeta,
                    mashProfile: {
                      steps: processMeta.mashProfile.steps.filter((candidate) => candidate.id !== step.id)
                    }
                  })}
                  className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
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
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [pendingCustom, setPendingCustom] = useState(false);
  const [customMessage, setCustomMessage] = useState<string | null>(null);
  const placeholder = {
    fermentable: "Найти солод, сахар или другой ферментируемый ингредиент",
    hop: "Найти сорт или форму хмеля",
    yeast: "Найти дрожжи",
    water_prep: "Найти соль, кислоту или добавку для воды",
    misc: "Найти прочую добавку"
  }[draft.category];

  const emptyCta = (
    <div className="space-y-2 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
      <p>Ничего не найдено для «{draft.selectedName.trim() || "этого запроса"}».</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pendingCustom || !draft.selectedName.trim()}
          onClick={async () => {
            setPendingCustom(true);
            const result = await createRecipeCustomIngredientAction({
              category: draft.category,
              subtype: draft.subtype,
              displayName: draft.selectedName.trim(),
              defaultDisplayUnit: draft.amountEnteredUnit
            });
            setPendingCustom(false);
            setCustomMessage(result.message);
            if (result.ok && result.item) {
              setCreatingCustom(false);
              onChange(applySelection(draft, result.item));
            }
          }}
          className="rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
        >
          Создать свой ингредиент
        </button>
        <button
          type="button"
          disabled={!draft.selectedName.trim()}
          onClick={async () => {
            const result = await proposeRecipeIngredientAction({
              category: draft.category,
              subtype: draft.subtype,
              displayName: draft.selectedName.trim()
            });
            setCustomMessage(result.message);
          }}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs"
        >
          Предложить ингредиент в каталог
        </button>
      </div>
      {customMessage ? <p className="text-xs text-zinc-500">{customMessage}</p> : null}
    </div>
  );

  const isHop = draft.category === "hop";
  const hopUseType = getHopUseType(draft);

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-100 bg-white p-5 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-950">
            {isExisting ? "Редактор позиции" : "Новая позиция"}
          </h3>
          <p className="text-xs text-zinc-500">{getSectionTitle(draft.category)}</p>
        </div>
        {creatingCustom ? null : (
          <button type="button" onClick={() => setCreatingCustom((current) => !current)} className="text-xs text-zinc-500 underline">
            {creatingCustom ? "Скрыть" : "Custom ingredient"}
          </button>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-700">Ингредиент</label>
        <IngredientPicker
          category={draft.category}
          value={draft.selectedName}
          onValueChange={(value) => onChange(applyQueryChange(draft, value))}
          onSelect={(item) => onChange(applySelection(draft, item))}
          placeholder={placeholder}
          emptyCta={emptyCta}
        />
        <p className="text-xs text-zinc-500">
          {draft.ingredientCatalogItemId || draft.userCustomIngredientId
            ? draft.selectedSummary || draft.familyDisplayName || "Ингредиент выбран."
            : "Сначала выберите ингредиент из каталога или создайте свой."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
        <label className="space-y-1 text-xs font-medium text-zinc-700">
          Количество
          <input
            type="number"
            min={0.001}
            step={0.001}
            value={draft.amountEnteredQuantity}
            onChange={(event) => onChange({ ...draft, amountEnteredQuantity: event.target.value })}
            className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
          />
        </label>
        <label className="space-y-1 text-xs font-medium text-zinc-700">
          Ед. изм.
          <select
            value={draft.amountEnteredUnit}
            onChange={(event) => onChange({ ...draft, amountEnteredUnit: event.target.value as InventoryUnit })}
            className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
          >
            {draft.allowedUnits.map((unit) => (
              <option key={unit} value={unit}>{inventoryUnitLabels[unit] ?? unit}</option>
            ))}
          </select>
        </label>
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
              {recipeHopUseTypes.map((useType) => <option key={useType} value={useType}>{hopUseTypeLabels[useType]}</option>)}
            </select>
          </label>

          {(hopUseType === "boil" || hopUseType === "whirlpool" || hopUseType === "dip_hop") ? (
            <label className="space-y-1 text-xs font-medium text-zinc-700">
              Минут
              <input
                type="number"
                min={0}
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
          ) : hopUseType === "dry_hop" ? (
            <label className="space-y-1 text-xs font-medium text-zinc-700">
              Длительность, дн
              <input
                type="number"
                min={1}
                value={draft.stepMeta.durationDays ?? ""}
                onChange={(event) => onChange({
                  ...draft,
                  stepMeta: {
                    ...draft.stepMeta,
                    durationDays: event.target.value
                  }
                })}
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              />
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
                value={draft.stepMeta.temperatureC ?? ""}
                onChange={(event) => onChange({
                  ...draft,
                  stepMeta: {
                    ...draft.stepMeta,
                    temperatureC: event.target.value
                  }
                })}
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              />
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
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            {draft.selectedSummary || "Рекомендуемый диапазон выбранных дрожжей будет показан здесь, если он есть в каталоге."}
          </div>
        </div>
      ) : null}

      {draft.category === "water_prep" || draft.category === "misc" ? (
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

      {fieldError ? <p className="text-sm text-rose-700">{fieldError}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3">
        <div className="text-xs text-zinc-500">На странице одновременно открыт только один редактор ингредиента.</div>
        <div className="flex flex-wrap gap-2">
          {onDelete ? (
            <button type="button" onClick={onDelete} className="rounded-md border border-rose-300 bg-white px-3 py-2 text-sm text-rose-700">
              Удалить
            </button>
          ) : null}
          <button type="button" onClick={onCancel} className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm">
            Отмена
          </button>
          <button type="button" onClick={onSave} className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white">
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RecipeDesigner({ mode, initialRecipe, initialTitle, onSaveStatusChange, onRecipeCreated, onPublicationStateChange }: Props) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const initialPublicationState = normalizeEditorPublicationState(initialRecipe?.publicationState);
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
  const [batchSize, setBatchSize] = useState({ quantity: initialRecipe ? String(initialRecipe.batchSizeEnteredQuantity) : "20", unit: "l" as InventoryUnit });
  const [efficiency, setEfficiency] = useState(initialRecipe?.efficiency != null ? String(initialRecipe.efficiency) : "75");
  const [boilTimeMinutes, setBoilTimeMinutes] = useState(initialRecipe?.boilTimeMinutes != null ? String(initialRecipe.boilTimeMinutes) : "60");
  const [processMeta, setProcessMeta] = useState<RecipeProcessMeta>(() => cloneRecipeProcessMeta(initialRecipe?.processMeta ?? defaultRecipeProcessMeta));
  const [ingredients, setIngredients] = useState<DesignerIngredient[]>(initialRecipe?.ingredients.map(toDesignerIngredient) ?? []);
  const [openEditor, setOpenEditor] = useState<OpenEditorState | null>(null);
  const [saveResult, setSaveResult] = useState<RecipeEditorResult | null>(null);
  const [preview, setPreview] = useState<RecipeDraftPreviewDto | null>(buildInitialPreview(initialRecipe));
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);
  const [blockedSignature, setBlockedSignature] = useState<string | null>(null);
  const [saveResultSignature, setSaveResultSignature] = useState<string | null>(null);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [makePrivateConfirmOpen, setMakePrivateConfirmOpen] = useState(false);
  const [readinessDialogOpen, setReadinessDialogOpen] = useState(false);
  const pendingSaveRef = useRef(false);

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
    ingredients: ingredients.map(buildIngredientPayload)
  }), [authorNotes, batchSize.quantity, batchSize.unit, boilTimeMinutes, description, efficiency, ingredients, processMeta, publicationState, styleId, title]);
  const savePayload = useMemo(() => normalizeSavePayload(payload), [payload]);

  const currentSignature = useMemo(() => JSON.stringify(payload), [payload]);
  const [savedSignature, setSavedSignature] = useState(currentSignature);
  const isDirty = currentSignature !== savedSignature;
  const editorDirty = openEditor ? serializeIngredient(openEditor.draft) !== openEditor.initialSignature : false;
  const hasCurrentSaveError = saveResultSignature === currentSignature && Boolean(saveResult && !saveResult.ok);
  const saveStatus: RecipeSaveStatus = hasCurrentSaveError ? "error" : (pendingSave || isDirty ? "saving" : "saved");
  const persistMode: "create" | "edit" = activeRecipeId ? "edit" : mode;

  useEffect(() => {
    onSaveStatusChange?.(saveStatus);
  }, [onSaveStatusChange, saveStatus]);

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

    const nextPayload = normalizeSavePayload({
      ...payload,
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
    const result = persistMode === "create"
      ? await createRecipeAction(nextPayload)
      : await updateRecipeAction(activeRecipeId!, nextPayload);
    setPendingSave(false);

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
        startTransition(() => {
          router.replace(`/app/recipes/${savedRecipe.id}/edit`);
        });
      }

      return result;
    }

    setSaveResult(result);
    setSaveResultSignature(surfaceInlineResult ? nextSignature : null);
    return result;
  }, [activeRecipeId, currentSignature, onRecipeCreated, payload, persistMode, publicationState, router]);

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
    if (editorDirty && !window.confirm("Текущий редактор ингредиента содержит несохранённые изменения. Закрыть его?")) {
      return;
    }
    setOpenEditor(next);
  };

  const closeEditor = (force = false) => {
    if (!openEditor) {
      return;
    }

    if (!force && editorDirty && !window.confirm("Закрыть редактор ингредиента без сохранения изменений?")) {
      return;
    }

    setOpenEditor(null);
  };

  const openAddEditor = (category: IngredientCategory, hopUseType: RecipeHopUseType = "boil") => {
    const draft = createEmptyIngredient(category, hopUseType);
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
  const waterPrep = getCategoryRows(ingredients, "water_prep");
  const misc = getCategoryRows(ingredients, "misc");

  const fermentableTotalKg = getFermentableWeightTotalKg(fermentables);
  const hopTotalG = getHopWeightTotalG(hops);

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
        empty: "Соберите grain bill или добавьте сахар/экстракт."
      },
      {
        category: "hop",
        title: "Хмель",
        subtitle: hops.length ? `${hopTotalG.toFixed(0)} г` : undefined,
        items: hops,
        empty: "Пока нет хмеля. Добавьте кипячение, whirlpool, dry hop или dip hop.",
        renderItems: (items) => (
          <div className="space-y-4">
            {recipeHopUseTypes.map((useType) => {
              const rows = items
                .filter((item) => getHopUseType(item) === useType)
                .sort((left, right) => getHopTimeMinutesValue(right) - getHopTimeMinutesValue(left));
              return (
                <div key={useType} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-1 pb-1.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-600">{hopUseTypeLabels[useType]}</h4>
                    <button type="button" onClick={() => openAddEditor("hop", useType)} className="rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
                      + Добавить
                    </button>
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
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-2.5 text-sm text-zinc-400">Пусто</p>
                  )}
                </div>
              );
            })}
          </div>
        )
      },
      {
        category: "yeast",
        title: "Дрожжи",
        items: yeasts,
        empty: "Добавьте дрожжи для публикации рецепта."
      },
      {
        category: "water_prep",
        title: "Водоподготовка",
        items: waterPrep,
        empty: "Добавки для воды можно оставить пустыми."
      },
      {
        category: "misc",
        title: "Прочее",
        items: misc,
        empty: "Фининг, специи и другие добавки."
      }
    ];

  const editorPanel = openEditor ? (
    <IngredientEditor
      draft={openEditor.draft}
      isExisting={openEditor.isExisting}
      onChange={(next) => setOpenEditor((current) => current ? { ...current, draft: next } : current)}
      onSave={saveEditor}
      onCancel={() => closeEditor()}
      onDelete={openEditor.localId ? () => deleteIngredient(openEditor.localId!) : undefined}
      saveLabel={openEditor.localId ? "Сохранить позицию" : "Добавить позицию"}
      fieldError={
        !openEditor.draft.ingredientCatalogItemId && !openEditor.draft.userCustomIngredientId
          ? "Выберите ингредиент."
          : !openEditor.draft.amountEnteredQuantity.trim()
            ? "Укажите количество."
            : null
      }
    />
  ) : null;

  const handlePublishClick = () => {
    if (!isPublishReady) {
      setReadinessDialogOpen(true);
      return;
    }

    setPublishConfirmOpen(true);
  };

  const handlePublishConfirm = async () => {
    const result = await persistRecipe({
      nextPublicationState: "published",
      surfaceInlineResult: false
    });

    setPublishConfirmOpen(false);

    if (!result?.ok && result?.fieldErrors && Object.keys(result.fieldErrors).length) {
      setReadinessDialogOpen(true);
    }
  };

  const handleMakePrivateConfirm = async () => {
    const result = await persistRecipe({
      nextPublicationState: "private",
      surfaceInlineResult: false
    });

    if (result?.ok) {
      setMakePrivateConfirmOpen(false);
      return;
    }

    setMakePrivateConfirmOpen(false);
  };

  const handleVersionChange = (nextRecipeId: string) => {
    if (!nextRecipeId || nextRecipeId === activeRecipeId) {
      return;
    }

    startTransition(() => {
      router.push(`/app/recipes/${nextRecipeId}/edit`);
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
    const result = await createRecipeVersionAction(activeRecipeId);
    setPendingSave(false);

    if (!result.ok || !result.recipe) {
      setSaveResult(result);
      setSaveResultSignature(currentSignature);
      return;
    }

    const nextRecipe = result.recipe;
    startTransition(() => {
      router.push(`/app/recipes/${nextRecipe.id}/edit`);
    });
  };

  return (
    <div className="space-y-5">
      <section className="-mx-4 bg-white/90 px-4 py-3 shadow-[0_1px_3px_0_rgb(0_0_0_/_0.04)] backdrop-blur-md">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(220px,1fr)_auto] xl:items-end">
          <div className="min-w-0">
            <label className="block min-w-0">
              <span className="mb-1 block text-[11px] font-medium text-zinc-600">Название рецепта</span>
              <input
                id="recipe-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="h-10 w-full min-w-0 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 shadow-sm placeholder:font-normal placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-200"
                placeholder="Название рецепта"
              />
            </label>
          </div>
          <div className="space-y-1">
            <StylePicker id="recipe-style" value={styleId} onChange={setStyleId} className="min-w-0" />
            {sectionErrors.styleId ? <p className="text-xs text-rose-600">{sectionErrors.styleId}</p> : null}
          </div>
          <div className="flex flex-wrap items-end gap-2 xl:justify-end">
            {canManagePublication && savedVisibility === "private" ? (
              <button
                type="button"
                onClick={handlePublishClick}
                disabled={pendingSave}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-900 bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Опубликовать
              </button>
            ) : null}
            {canManagePublication && savedVisibility === "published" ? (
              <>
                <button
                  type="button"
                  onClick={() => setMakePrivateConfirmOpen(true)}
                  disabled={pendingSave}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Сделать приватным
                </button>
                {activeRecipeSlug ? (
                  <a
                    href={`/recipes/${activeRecipeSlug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
                  >
                    Открыть публичную страницу
                  </a>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        {activeRecipeId ? (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-zinc-600">Версия</span>
              <select
                value={activeRecipeId}
                onChange={(event) => handleVersionChange(event.target.value)}
                className="h-8 min-w-[92px] rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700"
              >
                {recipeVersions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {`v${version.versionNumber}${version.id === activeRecipeId ? " • current" : ""}`}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void handleCreateVersion()}
              disabled={pendingSave}
              className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Новая версия
            </button>
            <span className="mb-1 text-xs text-zinc-500">Текущая: v{activeVersionNumber}</span>
          </div>
        ) : null}
        {sectionErrors.title ? <p className="mt-1.5 text-xs text-rose-600">{sectionErrors.title}</p> : null}
        {visibleSaveResult && !visibleSaveResult.ok ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
            <p className="text-rose-600">{visibleSaveResult.message}</p>
            {hasRetriableSaveError ? (
              <button
                type="button"
                onClick={() => void persistRecipe()}
                disabled={pendingSave}
                className="font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-950 disabled:opacity-60"
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
          sectionErrors={sectionErrors}
          preview={preview}
        />
        <RecipeStyleStatsBlock preview={preview} recalculating={recalculating} previewError={previewError} />
      </section>

      <div className="space-y-4">
        {sectionDefinitions.map((section) => {
          const IconComponent = categoryIcons[section.category];
          const iconBg = categoryIconBg[section.category];
          return (
            <section key={section.category} className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
                    <IconComponent className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <h2 className="text-base font-semibold text-zinc-950">{section.title}</h2>
                      {section.subtitle ? <span className="text-sm tabular-nums text-zinc-400">({section.subtitle})</span> : null}
                    </div>
                    {sectionErrors[`ingredients.${section.category}`] ? <p className="text-xs text-rose-700">{sectionErrors[`ingredients.${section.category}`]}</p> : null}
                  </div>
                </div>
                {section.category !== "hop" ? (
                  <button type="button" onClick={() => openAddEditor(section.category)} className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
                    + Добавить
                  </button>
                ) : null}
              </div>

              {section.renderItems ? (
                section.renderItems(section.items)
              ) : section.items.length ? (
                <ul className="space-y-1.5">
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
                    />
                  ))}
                </ul>
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-200 px-3 py-3 text-sm text-zinc-400">{section.empty}</div>
              )}
            </section>
          );
        })}
      </div>

      <div className="space-y-2">
        <RecipeProfiles processMeta={processMeta} onChange={setProcessMeta} />
        {sectionErrors["processMeta.mashProfile.steps"] ? (
          <p className="text-xs text-rose-700">{sectionErrors["processMeta.mashProfile.steps"]}</p>
        ) : null}
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <details className="group rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm" open>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-zinc-700">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-100">
              <FileText className="h-3.5 w-3.5 text-zinc-500" />
            </div>
            Описание рецепта
            <ChevronRight className="ml-auto h-4 w-4 text-zinc-400 transition-transform group-open:rotate-90" />
          </summary>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-3 min-h-28 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-300 focus:bg-white focus:outline-none" placeholder="Публичное описание рецепта" />
          {sectionErrors.description ? <p className="mt-2 text-xs text-rose-700">{sectionErrors.description}</p> : null}
        </details>
        <details className="group rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm" open>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-zinc-700">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-100">
              <StickyNote className="h-3.5 w-3.5 text-zinc-500" />
            </div>
            Личные заметки
            <ChevronRight className="ml-auto h-4 w-4 text-zinc-400 transition-transform group-open:rotate-90" />
          </summary>
          <textarea value={authorNotes} onChange={(event) => setAuthorNotes(event.target.value)} className="mt-3 min-h-28 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-300 focus:bg-white focus:outline-none" placeholder="Видны только вам" />
        </details>
      </section>

      <ConfirmActionDialog
        open={publishConfirmOpen}
        title="Опубликовать рецепт?"
        description="После публикации он станет доступен по публичной ссылке."
        confirmLabel="Опубликовать"
        pendingLabel="Публикуем..."
        tone="primary"
        pending={pendingSave}
        onConfirm={() => void handlePublishConfirm()}
        onClose={() => setPublishConfirmOpen(false)}
      />

      <ConfirmActionDialog
        open={makePrivateConfirmOpen}
        title="Сделать рецепт приватным?"
        description="После этого публичная страница перестанет быть доступна."
        confirmLabel="Сделать приватным"
        pendingLabel="Меняем доступ..."
        pending={pendingSave}
        onConfirm={() => void handleMakePrivateConfirm()}
        onClose={() => setMakePrivateConfirmOpen(false)}
      />

      <PublicationReadinessDialog
        open={readinessDialogOpen}
        checklist={publishChecklist}
        onClose={() => setReadinessDialogOpen(false)}
      />

      {openEditor ? (
        <div className="fixed inset-0 z-30 bg-black/45 p-3 sm:p-6" onClick={() => closeEditor()}>
          <div className={`mx-auto overflow-y-auto ${isMobile ? "mt-auto max-h-[92vh] w-full" : "mt-6 max-h-[calc(100vh-96px)] w-full max-w-3xl"}`}>
            <div onClick={(event) => event.stopPropagation()}>
              {editorPanel}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
