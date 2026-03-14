"use client";

import { convertWeight, evaluateStyleFit, styleRangeFixtures } from "@nb/brewing-core";
import React, { startTransition, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  createRecipeCustomIngredientAction,
  createRecipeAction,
  previewRecipeDraftAction,
  proposeRecipeIngredientAction,
  updateRecipeAction,
  type RecipeEditorPayload,
  type RecipeEditorResult
} from "@/app/(app)/app/recipes/actions";
import { IngredientPicker } from "@/components/ingredients/ingredient-picker";
import type { IngredientCategory, IngredientSuggestionItem, IngredientSubtype, IngredientType } from "@/features/ingredients/contracts";
import { ingredientCategoryLabels } from "@/features/ingredients/presentation";
import { resolveIngredientCategory, resolveLegacyIngredientType } from "@/features/ingredients/taxonomy";
import {
  formatInventoryQuantityInputValue,
  resolveInventoryMeasurementForDisplay
} from "@/features/inventory/display";
import {
  inventoryUnitLabels,
  inventoryVolumeUnits,
  resolveHumanFacingInventoryUnitProfile,
  type InventoryUnit,
  type InventoryUnitDimension
} from "@/features/inventory/units";
import {
  defaultRecipeProcessMeta,
  recipeFermentableUseTypes,
  recipeHopUseTypes,
  recipePublicationStateLabels,
  recipePublicationStates,
  type RecipeDetailDto,
  type RecipeDraftPreviewDto,
  type RecipeHopUseType,
  type RecipeProcessMeta,
  type RecipePublicationState
} from "@/features/recipes/contracts";
import { formatColorWithEbc, formatGravityWithPlato } from "@/features/recipes/format";
import { globalBrewingRanges } from "@/features/recipes/style-ranges";

type Props = {
  mode: "create" | "edit";
  initialRecipe?: RecipeDetailDto;
};

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

  const styleRange = recipe.styleId ? styleRangeFixtures.find((style) => style.id === recipe.styleId) ?? null : null;
  const styleFit = styleRange && recipe.og != null && recipe.fg != null && recipe.abv != null && recipe.ibu != null && recipe.color != null
    ? evaluateStyleFit(styleRange, {
      og: recipe.og,
      fg: recipe.fg,
      abv: recipe.abv,
      ibu: recipe.ibu,
      srm: recipe.color
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
      label: "В диапазоне",
      badgeClassName: "bg-emerald-100 text-emerald-800",
      markerClassName: "bg-emerald-500"
    };
  }

  if (status === "below") {
    return {
      label: "Ниже",
      badgeClassName: "bg-amber-100 text-amber-800",
      markerClassName: "bg-amber-500"
    };
  }

  if (status === "above") {
    return {
      label: "Выше",
      badgeClassName: "bg-rose-100 text-rose-800",
      markerClassName: "bg-rose-500"
    };
  }

  return {
    label: "Практич. диапазон",
    badgeClassName: "bg-zinc-100 text-zinc-600",
    markerClassName: "bg-zinc-500"
  };
};

function StylePicker({
  value,
  onChange,
  className
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedStyle = useMemo(
    () => styleRangeFixtures.find((style) => style.id === value) ?? null,
    [value]
  );
  const filteredStyles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return styleRangeFixtures;
    }

    return styleRangeFixtures.filter((style) => {
      const haystack = `${style.id} ${style.name}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${className ?? "min-w-[280px] shrink-0"}`}>
      <div className="mb-1 text-[11px] font-medium text-zinc-600">Стиль BJCP</div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 text-left text-sm text-zinc-900 shadow-sm"
      >
        <span className={`truncate ${selectedStyle ? "text-zinc-900" : "text-zinc-500"}`}>
          {selectedStyle ? selectedStyle.name : "Выбрать стиль"}
        </span>
        <span className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-zinc-400">
          {selectedStyle?.id ?? "BJCP"}
        </span>
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+8px)] z-40 w-[min(420px,calc(100vw-32px))] rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти стиль по id или названию"
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
                    <div className="text-xs text-zinc-500">{style.id}</div>
                  </div>
                  {value === style.id ? <span className="text-[11px] text-zinc-500">выбран</span> : null}
                </button>
              ))
            ) : (
              <div className="px-3 py-4 text-sm text-zinc-500">Ничего не найдено.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

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
  const range = preview?.styleRange ?? {
    og: globalBrewingRanges.og,
    fg: globalBrewingRanges.fg,
    abv: globalBrewingRanges.abv,
    ibu: globalBrewingRanges.ibu,
    colorSrm: globalBrewingRanges.colorSrm
  };
  const fit = preview?.styleFit;
  const items = [
    {
      label: "OG",
      value: formatGravityWithPlato(preview?.og ?? null),
      range: `${range.og.min.toFixed(3)} - ${range.og.max.toFixed(3)}`,
      status: hasStyleRange ? fit?.og.status ?? null : null,
      positionPercent: getMetricPositionPercent(preview?.og ?? null, range.og.min, range.og.max)
    },
    {
      label: "FG",
      value: formatGravityWithPlato(preview?.fg ?? null),
      range: `${range.fg.min.toFixed(3)} - ${range.fg.max.toFixed(3)}`,
      status: hasStyleRange ? fit?.fg.status ?? null : null,
      positionPercent: getMetricPositionPercent(preview?.fg ?? null, range.fg.min, range.fg.max)
    },
    {
      label: "ABV",
      value: preview?.abv == null ? "—" : `${preview.abv.toFixed(1)}%`,
      range: `${range.abv.min.toFixed(1)} - ${range.abv.max.toFixed(1)}%`,
      status: hasStyleRange ? fit?.abv.status ?? null : null,
      positionPercent: getMetricPositionPercent(preview?.abv ?? null, range.abv.min, range.abv.max)
    },
    {
      label: "IBU",
      value: preview?.ibu == null ? "—" : `${preview.ibu.toFixed(0)} IBU`,
      range: `${range.ibu.min.toFixed(0)} - ${range.ibu.max.toFixed(0)} IBU`,
      status: hasStyleRange ? fit?.ibu.status ?? null : null,
      positionPercent: getMetricPositionPercent(preview?.ibu ?? null, range.ibu.min, range.ibu.max)
    },
    {
      label: "Color",
      value: formatColorWithEbc(preview?.color ?? null),
      range: `${range.colorSrm.min.toFixed(0)} - ${range.colorSrm.max.toFixed(0)} SRM`,
      status: hasStyleRange ? fit?.colorSrm.status ?? null : null,
      positionPercent: getMetricPositionPercent(preview?.color ?? null, range.colorSrm.min, range.colorSrm.max)
    }
  ];

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-950">Стиль и расчёт</h2>
          <p className="text-xs text-zinc-500">
            {previewError
              ? previewError
              : hasCalculatedMetrics
                ? preview?.styleRange
                  ? `Текущие показатели draft против диапазона ${preview.styleRange.name}.`
                  : "Текущие показатели draft против практических диапазонов для пивных рецептов."
                : "Добавьте хотя бы одно сбраживаемое; для IBU понадобится ещё и хмель."}
          </p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${recalculating ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-zinc-700"}`}>
          {recalculating ? "Пересчитываем..." : "Актуально по draft"}
        </span>
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const appearance = getMetricStatusAppearance(item.status);

          return (
            <div key={item.label} className="grid gap-3 rounded-xl border border-zinc-100 px-3 py-3 sm:grid-cols-[72px_minmax(0,1fr)_190px_220px] sm:items-center">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{item.label}</div>
              <div className="text-sm font-medium text-zinc-950">{item.value}</div>
              <div className="text-xs text-zinc-500">{item.range}</div>
              <div className="flex items-center gap-3">
                <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${appearance.badgeClassName}`}>
                  {appearance.label}
                </span>
                {item.positionPercent == null ? (
                  <span className="text-[11px] text-zinc-400">Нет расчёта</span>
                ) : (
                  <div className="relative h-2 w-full rounded-full bg-zinc-200">
                    <span
                      className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm ${appearance.markerClassName}`}
                      style={{ left: `${item.positionPercent}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SectionRow({
  ingredient,
  onEdit,
  onDelete
}: {
  ingredient: DesignerIngredient;
  onEdit: (ingredient: DesignerIngredient) => void;
  onDelete: (localId: string) => void;
}) {
  return (
    <li className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-950">{ingredient.selectedName}</div>
          <div className="mt-1 text-xs text-zinc-500">{buildSummaryDetails(ingredient) || ingredient.selectedSummary || ingredient.familyDisplayName || "Без доп. деталей"}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-medium text-zinc-900">{getQuantityText(ingredient)}</div>
          <div className="mt-2 flex justify-end gap-2 text-xs">
            <button type="button" onClick={() => onEdit(ingredient)} className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5">Редактировать</button>
            <button type="button" onClick={() => onDelete(ingredient.localId)} className="rounded-md border border-rose-300 bg-white px-2.5 py-1.5 text-rose-700">Удалить</button>
          </div>
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
    <div className="grid gap-4 lg:grid-cols-2">
      <details className="rounded-2xl border border-zinc-200 bg-white p-4">
        <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-950">Mash Profile</summary>
        <div className="mt-4 space-y-3">
          {processMeta.mashProfile.steps.map((step, index) => (
            <div key={step.id} className="grid gap-2 rounded-xl border border-zinc-100 bg-zinc-50 p-3 sm:grid-cols-[minmax(0,1fr)_120px_120px_auto]">
              <input
                value={step.name}
                onChange={(event) => onChange({
                  ...processMeta,
                  mashProfile: {
                    steps: processMeta.mashProfile.steps.map((candidate) => candidate.id === step.id ? { ...candidate, name: event.target.value } : candidate)
                  }
                })}
                className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm"
                placeholder="Название шага"
              />
              <input
                type="number"
                value={step.temperatureC}
                onChange={(event) => onChange({
                  ...processMeta,
                  mashProfile: {
                    steps: processMeta.mashProfile.steps.map((candidate) => candidate.id === step.id ? { ...candidate, temperatureC: Number(event.target.value) } : candidate)
                  }
                })}
                className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm"
                placeholder="°C"
              />
              <input
                type="number"
                value={step.durationMinutes}
                onChange={(event) => onChange({
                  ...processMeta,
                  mashProfile: {
                    steps: processMeta.mashProfile.steps.map((candidate) => candidate.id === step.id ? { ...candidate, durationMinutes: Number(event.target.value) } : candidate)
                  }
                })}
                className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm"
                placeholder="мин"
              />
              <button
                type="button"
                disabled={processMeta.mashProfile.steps.length === 1}
                onClick={() => onChange({
                  ...processMeta,
                  mashProfile: {
                    steps: processMeta.mashProfile.steps.filter((candidate) => candidate.id !== step.id)
                  }
                })}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
              >
                Удалить
              </button>
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
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            Добавить шаг
          </button>
        </div>
      </details>

      <details className="rounded-2xl border border-zinc-200 bg-white p-4">
        <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-950">Fermentation Profile</summary>
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium text-zinc-600">
              Primary temp, °C
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
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-zinc-600">
              Primary duration, days
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
                className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              />
            </label>
          </div>

          <div className="space-y-2">
            {processMeta.fermentationProfile.extraSteps.map((step) => (
              <div key={step.id} className="grid gap-2 rounded-xl border border-zinc-100 bg-zinc-50 p-3 sm:grid-cols-[minmax(0,1fr)_120px_120px_auto]">
                <input
                  value={step.name}
                  onChange={(event) => onChange({
                    ...processMeta,
                    fermentationProfile: {
                      ...processMeta.fermentationProfile,
                      extraSteps: processMeta.fermentationProfile.extraSteps.map((candidate) => candidate.id === step.id ? { ...candidate, name: event.target.value } : candidate)
                    }
                  })}
                  className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm"
                />
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
                  className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm"
                  placeholder="°C"
                />
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
                  className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm"
                  placeholder="дни"
                />
                <button
                  type="button"
                  onClick={() => onChange({
                    ...processMeta,
                    fermentationProfile: {
                      ...processMeta.fermentationProfile,
                      extraSteps: processMeta.fermentationProfile.extraSteps.filter((candidate) => candidate.id !== step.id)
                    }
                  })}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                >
                  Удалить
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
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              Добавить шаг
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {(["coldCrash", "conditioning"] as const).map((key) => (
              <div key={key} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-900">
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
                  />
                  {key === "coldCrash" ? "Cold crash" : "Conditioning"}
                </label>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
                    className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm"
                    placeholder="°C"
                  />
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
                    className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm"
                    placeholder="дни"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </details>
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
    <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
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

export function RecipeDesigner({ mode, initialRecipe }: Props) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [title, setTitle] = useState(initialRecipe?.title ?? "");
  const [styleId, setStyleId] = useState(initialRecipe?.styleId ?? "");
  const [description, setDescription] = useState(initialRecipe?.description ?? "");
  const [authorNotes, setAuthorNotes] = useState(initialRecipe?.authorNotes ?? "");
  const [publicationState, setPublicationState] = useState<RecipePublicationState>(initialRecipe?.publicationState ?? "draft");
  const [batchSize, setBatchSize] = useState({ quantity: initialRecipe ? String(initialRecipe.batchSizeEnteredQuantity) : "20", unit: initialRecipe?.batchSizeEnteredUnit ?? "l" });
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

  const currentSignature = useMemo(() => JSON.stringify(payload), [payload]);
  const [savedSignature, setSavedSignature] = useState(currentSignature);
  const isDirty = currentSignature !== savedSignature;
  const editorDirty = openEditor ? serializeIngredient(openEditor.draft) !== openEditor.initialSignature : false;

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setRecalculating(true);
      const result = await previewRecipeDraftAction(payload);
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
  }, [payload]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

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

  const handleSave = async () => {
    setPendingSave(true);
    const result = mode === "create"
      ? await createRecipeAction(payload)
      : await updateRecipeAction(initialRecipe!.id, payload);

    setPendingSave(false);
    setSaveResult(result);

    if (!result.ok || !result.recipe) {
      return;
    }

    setSavedSignature(JSON.stringify(payload));

    if (result.recipe.publicationState === "draft") {
      if (mode === "create") {
        router.replace(`/app/recipes/${result.recipe.id}/edit`);
      }
      return;
    }

    router.push(`/app/recipes/${result.recipe.id}`);
  };

  const sectionErrors = saveResult?.fieldErrors ?? {};
  const fermentables = getCategoryRows(ingredients, "fermentable");
  const hops = getCategoryRows(ingredients, "hop");
  const yeasts = getCategoryRows(ingredients, "yeast");
  const waterPrep = getCategoryRows(ingredients, "water_prep");
  const misc = getCategoryRows(ingredients, "misc");

  const sectionDefinitions: Array<{
    category: IngredientCategory;
    title: string;
    items: DesignerIngredient[];
    empty: string;
    extraHeader?: React.ReactNode;
    renderItems?: (items: DesignerIngredient[]) => React.ReactNode;
  }> = [
    {
      category: "fermentable",
      title: "Сбраживаемое",
      items: fermentables,
      empty: "Соберите grain bill или добавьте сахар/экстракт.",
      extraHeader: fermentables.length ? <span className="text-xs text-zinc-500">Итого: {getFermentableWeightTotalKg(fermentables).toFixed(2)} кг</span> : null
    },
    {
      category: "hop",
      title: "Хмель",
      items: hops,
      empty: "Пока нет хмеля. Добавьте кипячение, whirlpool, dry hop или dip hop.",
      renderItems: (items) => (
        <div className="space-y-4">
          {recipeHopUseTypes.map((useType) => {
            const rows = items.filter((item) => getHopUseType(item) === useType);
            return (
              <div key={useType} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{hopUseTypeLabels[useType]}</h4>
                  <button type="button" onClick={() => openAddEditor("hop", useType)} className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs">
                    Добавить
                  </button>
                </div>
                {rows.length ? (
                  <ul className="space-y-2">
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
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-500">Подсписок пока пуст.</p>
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
      empty: "Добавьте дрожжи для recipe-ready статуса."
    },
    {
      category: "water_prep",
      title: "Водоподготовка",
      items: waterPrep,
      empty: "Добавки для воды можно оставить пустыми, если вы их не используете."
    },
    {
      category: "misc",
      title: "Прочее",
      items: misc,
      empty: "Фининг, специи и остальные добавки появятся здесь."
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

  return (
    <div className="space-y-6">
      <section className="sticky top-0 z-20 -mx-4 border-b border-zinc-200 bg-white/95 px-4 py-4 backdrop-blur">
        <div className="rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[280px] flex-[1_1_320px] space-y-1 text-[11px] font-medium text-zinc-600">
              Название рецепта
              <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900 shadow-sm" placeholder="Например, Czech Pils" />
            </label>

            <StylePicker value={styleId} onChange={setStyleId} className="min-w-[280px] flex-[1_1_300px]" />

            <label className="min-w-[164px] shrink-0 space-y-1 text-[11px] font-medium text-zinc-600">
              Объём партии
              <div className="grid grid-cols-[88px_64px] gap-2">
                <input type="number" min={0.1} step={0.1} value={batchSize.quantity} onChange={(event) => setBatchSize((current) => ({ ...current, quantity: event.target.value }))} className="h-10 rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900 shadow-sm" />
                <select value={batchSize.unit} onChange={(event) => setBatchSize((current) => ({ ...current, unit: event.target.value as typeof current.unit }))} className="h-10 rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900 shadow-sm">
                  {inventoryVolumeUnits.map((unit) => <option key={unit} value={unit}>{inventoryUnitLabels[unit] ?? unit}</option>)}
                </select>
              </div>
            </label>

            <label className="w-[116px] shrink-0 space-y-1 text-[11px] font-medium text-zinc-600">
              Эффект., %
              <input type="number" min={1} max={100} value={efficiency} onChange={(event) => setEfficiency(event.target.value)} className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900 shadow-sm" />
            </label>

            <label className="w-[120px] shrink-0 space-y-1 text-[11px] font-medium text-zinc-600">
              Кипяч., мин
              <input type="number" min={1} value={boilTimeMinutes} onChange={(event) => setBoilTimeMinutes(event.target.value)} className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900 shadow-sm" />
            </label>

            <label className="w-[160px] shrink-0 space-y-1 text-[11px] font-medium text-zinc-600">
              Состояние
              <select value={publicationState} onChange={(event) => setPublicationState(event.target.value as RecipePublicationState)} className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-900 shadow-sm">
                {recipePublicationStates.map((state) => <option key={state} value={state}>{recipePublicationStateLabels[state]}</option>)}
              </select>
            </label>

            <div className="flex shrink-0 items-end gap-2">
              <button type="button" onClick={() => void handleSave()} disabled={pendingSave} className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-60">
                {pendingSave ? "Сохраняем..." : "Сохранить"}
              </button>
              <Link
                href="/app/recipes"
                onClick={(event) => {
                  if (isDirty && !window.confirm("У вас есть несохранённые изменения. Выйти из designer?")) {
                    event.preventDefault();
                  }
                }}
                className="flex h-10 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-sm text-zinc-700"
              >
                К списку
              </Link>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span className={`rounded-full px-2 py-1 ${isDirty ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
              {isDirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}
            </span>
            {saveResult?.message ? <span>{saveResult.message}</span> : null}
          </div>
        </div>
      </section>

      {saveResult && !saveResult.ok ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {saveResult.message}
        </section>
      ) : null}

      <RecipeStyleStatsBlock preview={preview} recalculating={recalculating} previewError={previewError} />

      <section className="grid gap-4 lg:grid-cols-2">
        <label className="space-y-1 rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-medium text-zinc-700">
          Описание рецепта
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-32 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900" placeholder="Это публичное описание попадёт на detail/public page." />
        </label>
        <label className="space-y-1 rounded-2xl border border-zinc-200 bg-white p-4 text-sm font-medium text-zinc-700">
          Личные заметки
          <textarea value={authorNotes} onChange={(event) => setAuthorNotes(event.target.value)} className="min-h-32 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-900" placeholder="Эти заметки видны только автору." />
        </label>
      </section>

      <div className="space-y-4">
        {sectionDefinitions.map((section) => (
          <section key={section.category} className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-zinc-950">{section.title}</h2>
                {sectionErrors[`ingredients.${section.category}`] ? <p className="text-xs text-rose-700">{sectionErrors[`ingredients.${section.category}`]}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                {section.extraHeader}
                {section.category !== "hop" ? (
                  <button type="button" onClick={() => openAddEditor(section.category)} className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm">
                    Добавить
                  </button>
                ) : null}
              </div>
            </div>

            {section.renderItems ? (
              section.renderItems(section.items)
            ) : section.items.length ? (
              <ul className="space-y-2">
                {section.items.map((ingredient) => (
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
                  />
                ))}
              </ul>
            ) : (
              <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-3 py-4 text-sm text-zinc-500">{section.empty}</div>
            )}
          </section>
        ))}
      </div>

      <RecipeProfiles processMeta={processMeta} onChange={setProcessMeta} />

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
