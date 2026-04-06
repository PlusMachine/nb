"use client";

import React from "react";
import { useEffect, useRef, useState } from "react";

import { IngredientPicker, IngredientSelectionCard } from "@/components/ingredients/ingredient-picker";
import { IngredientPurchaseLinksField } from "@/components/ingredients/ingredient-purchase-links-field";
import { InventoryPriceInput } from "@/components/inventory/inventory-price-input";
import {
  createInitialInventoryOptionalFields,
  InventoryOptionalDisclosure,
  type InventoryOptionalFieldsState
} from "@/components/inventory/inventory-optional-disclosure";
import type {
  IngredientCategory,
  IngredientTechnicalData,
  IngredientSubtype,
  IngredientSuggestionItem
} from "@/features/ingredients/contracts";
import { resolveIngredientDisplayNames } from "@/features/ingredients/presentation";
import { resolveIngredientTechnicalDataColorRangeEbc } from "@/features/ingredients/technical-fields";
import type { InventoryPriceInputMode } from "@/features/inventory/purchase-cost";
import {
  getInventoryUnitInputStep,
  inventoryUnitLabels,
  resolveHumanFacingInventoryUnitProfile,
  type InventoryUnit
} from "@/features/inventory/units";
import { resolveInventoryPackEquivalent } from "@/features/inventory/pack";
import type { SystemCurrency } from "@/features/system/currency";

type InventoryCommonFields = InventoryOptionalFieldsState & {
  enteredQuantity: string;
  enteredUnit: InventoryUnit;
};

export type CatalogBatchOverrideFields = {
  fermentableColorEbc: string;
  fermentableExtractYieldPct: string;
  hopAlphaAcidPct: string;
};

type CatalogBatchSummaryEntry = {
  label: string;
  value: string;
};

export type CatalogIngredientSubmitPayload = {
  ingredientCatalogItemId?: string;
  userCustomIngredientId?: string;
  enteredQuantity: string;
  enteredUnit: InventoryUnit;
  priceInputMode?: InventoryPriceInputMode;
  priceInputAmount?: string;
  purchasedAt?: string;
  freshnessDate?: string;
  notes?: string;
  fermentableColorEbc?: string;
  fermentableExtractYieldPct?: string;
  hopAlphaAcidPct?: string;
  purchaseLinks?: string[];
  purchaseLinksTouched?: boolean;
};

type Props = {
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  preferredCurrency: SystemCurrency;
  pending: boolean;
  autoFocus?: boolean;
  initialSelection?: IngredientSuggestionItem | null;
  fieldErrors?: Record<string, string>;
  hidePicker?: boolean;
  selectionActionLabel?: string;
  onSubmit: (payload: CatalogIngredientSubmitPayload) => Promise<void>;
  onRequestCustom: () => void;
  onSelectionCleared?: () => void;
  onSelectedIngredientChange?: (selected: IngredientSuggestionItem | null) => void;
};

const createInitialCommonFields = (category?: IngredientCategory): InventoryCommonFields => {
  const unitProfile = resolveHumanFacingInventoryUnitProfile({ category });
  return {
    enteredQuantity: "",
    enteredUnit: unitProfile.defaultUnit,
    ...createInitialInventoryOptionalFields()
  };
};

export const createInitialCatalogBatchOverrideFields = (): CatalogBatchOverrideFields => ({
  fermentableColorEbc: "",
  fermentableExtractYieldPct: "",
  hopAlphaAcidPct: ""
});

const readFiniteNumber = (...values: Array<number | null | undefined>) => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
};

const formatInputNumber = (value: number | null) => (
  value == null ? "" : String(Number(value.toFixed(2)))
);

const formatCatalogBatchNumber = (value: string, suffix?: string) => {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return `${normalized}${suffix ?? ""}`;
};

const parseInputNumber = (value: string) => {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeCatalogComparableNumber = (value: number | null) => (
  value == null ? null : Number(value.toFixed(2))
);

const numbersEqual = (left: number | null, right: number | null) => {
  const normalizedLeft = normalizeCatalogComparableNumber(left);
  const normalizedRight = normalizeCatalogComparableNumber(right);

  if (normalizedLeft == null && normalizedRight == null) {
    return true;
  }

  if (normalizedLeft == null || normalizedRight == null) {
    return false;
  }

  return Math.abs(normalizedLeft - normalizedRight) < 0.001;
};

const isMaltTechnicalData = (
  technicalData: IngredientTechnicalData | null | undefined
): technicalData is Extract<IngredientTechnicalData, { type: "malt" }> => (
  technicalData?.type === "malt"
);

const isFermentableTechnicalData = (
  technicalData: IngredientTechnicalData | null | undefined
): technicalData is Extract<IngredientTechnicalData, { type: "fermentable" }> => (
  technicalData?.type === "fermentable"
);

const isHopTechnicalData = (
  technicalData: IngredientTechnicalData | null | undefined
): technicalData is Extract<IngredientTechnicalData, { type: "hop" }> => (
  technicalData?.type === "hop"
);

type CatalogBatchOverrideDefaults =
  | {
    kind: "fermentable";
    fermentableColorEbc: string;
    fermentableExtractYieldPct: string;
    colorEbc: number | null;
    extractYieldPct: number | null;
  }
  | {
    kind: "hop";
    hopAlphaAcidPct: string;
    alphaAcidPct: number | null;
  };

export const resolveCatalogBatchOverrideDefaults = (
  selected: IngredientSuggestionItem | null
): CatalogBatchOverrideDefaults | null => {
  if (!selected || selected.source !== "catalog" || !selected.technicalData) {
    return null;
  }

  if (isMaltTechnicalData(selected.technicalData)) {
    const colorEbc = resolveIngredientTechnicalDataColorRangeEbc(selected.technicalData)?.average ?? null;
    const extractYieldPct = readFiniteNumber(selected.technicalData.extractPctDryBasis);

    return {
      kind: "fermentable",
      fermentableColorEbc: formatInputNumber(colorEbc),
      fermentableExtractYieldPct: formatInputNumber(extractYieldPct),
      colorEbc,
      extractYieldPct
    };
  }

  if (isFermentableTechnicalData(selected.technicalData)) {
    const colorEbc = resolveIngredientTechnicalDataColorRangeEbc(selected.technicalData)?.average ?? null;
    const extractYieldPct = readFiniteNumber(selected.technicalData.extractPctDryBasis);

    return {
      kind: "fermentable",
      fermentableColorEbc: formatInputNumber(colorEbc),
      fermentableExtractYieldPct: formatInputNumber(extractYieldPct),
      colorEbc,
      extractYieldPct
    };
  }

  if (isHopTechnicalData(selected.technicalData)) {
    const alphaAcidPct = readFiniteNumber(
      selected.technicalData.alphaAcidPctTypical,
      selected.technicalData.alphaAcidPctMax,
      selected.technicalData.alphaAcidPctMin
    );

    return {
      kind: "hop",
      hopAlphaAcidPct: formatInputNumber(alphaAcidPct),
      alphaAcidPct
    };
  }

  return null;
};

export const shouldShowCatalogRequiredInventoryBlock = (
  selected: IngredientSuggestionItem | null
) => Boolean(selected);

export const shouldShowCatalogPickerStage = ({
  category,
  hidePicker = false,
  selected
}: {
  category?: IngredientCategory;
  hidePicker?: boolean;
  selected: IngredientSuggestionItem | null;
}) => Boolean(category) && !hidePicker && !selected;

export const shouldShowCatalogBatchOverrideSection = (
  selected: IngredientSuggestionItem | null
) => Boolean(resolveCatalogBatchOverrideDefaults(selected));

export const shouldShowCatalogOptionalSection = (
  selected: IngredientSuggestionItem | null
) => Boolean(selected);

export const resolveCatalogSelectionResetState = ({
  hidePicker = false
}: {
  hidePicker?: boolean;
}) => ({
  pickerValue: "",
  shouldRefocus: !hidePicker
});

export const hasCatalogIngredientTechnicalOverrides = ({
  selected,
  overrides
}: {
  selected: IngredientSuggestionItem | null;
  overrides: CatalogBatchOverrideFields;
}) => {
  const defaults = resolveCatalogBatchOverrideDefaults(selected);
  if (!defaults) {
    return false;
  }

  if (defaults.kind === "fermentable") {
    return (
      !numbersEqual(parseInputNumber(overrides.fermentableColorEbc), defaults.colorEbc)
      || !numbersEqual(parseInputNumber(overrides.fermentableExtractYieldPct), defaults.extractYieldPct)
    );
  }

  return !numbersEqual(parseInputNumber(overrides.hopAlphaAcidPct), defaults.alphaAcidPct);
};

export const resolveCatalogBatchOverrideSummaryState = ({
  defaults,
  overrides,
  hasTechnicalOverrides
}: {
  defaults: CatalogBatchOverrideDefaults | null;
  overrides: CatalogBatchOverrideFields;
  hasTechnicalOverrides: boolean;
}) => {
  if (!defaults) {
    return {
      currentEntries: [] as CatalogBatchSummaryEntry[],
      catalogEntries: null as CatalogBatchSummaryEntry[] | null,
      statusBadgeLabel: null
    };
  }

  if (defaults.kind === "fermentable") {
    const currentColor = formatCatalogBatchNumber(
      hasTechnicalOverrides ? overrides.fermentableColorEbc : defaults.fermentableColorEbc,
      " EBC"
    ) ?? "Цвет не указан";
    const currentExtract = formatCatalogBatchNumber(
      hasTechnicalOverrides ? overrides.fermentableExtractYieldPct : defaults.fermentableExtractYieldPct,
      "%"
    ) ?? "Экстракт не указан";
    const catalogColor = formatCatalogBatchNumber(defaults.fermentableColorEbc, " EBC") ?? "Цвет не указан";
    const catalogExtract = formatCatalogBatchNumber(defaults.fermentableExtractYieldPct, "%") ?? "Экстракт не указан";

    return {
      currentEntries: [
        { label: "Цвет", value: currentColor },
        { label: "Экстрактивность", value: currentExtract }
      ],
      catalogEntries: hasTechnicalOverrides
        ? [
          { label: "Цвет", value: catalogColor },
          { label: "Экстрактивность", value: catalogExtract }
        ]
        : null,
      statusBadgeLabel: hasTechnicalOverrides ? "ИЗМЕНЕННЫЙ" : null
    };
  }

  const currentAlpha = formatCatalogBatchNumber(
    hasTechnicalOverrides ? overrides.hopAlphaAcidPct : defaults.hopAlphaAcidPct,
    "% AA"
  ) ?? "Альфа-кислота не указана";
  const catalogAlpha = formatCatalogBatchNumber(defaults.hopAlphaAcidPct, "% AA") ?? "Альфа-кислота не указана";

  return {
    currentEntries: [
      { label: "Альфа-кислота", value: currentAlpha }
    ],
    catalogEntries: hasTechnicalOverrides
      ? [
        { label: "Альфа-кислота", value: catalogAlpha }
      ]
      : null,
    statusBadgeLabel: hasTechnicalOverrides ? "ИЗМЕНЕННЫЙ" : null
  };
};

export const resolveCatalogDerivedVariantPresentation = ({
  selected,
  hasTechnicalOverrides
}: {
  selected: IngredientSuggestionItem | null;
  hasTechnicalOverrides: boolean;
}) => {
  const isDerivedVariantFlow = Boolean(selected?.source === "catalog" && hasTechnicalOverrides);

  return {
    isDerivedVariantFlow,
    submitLabel: isDerivedVariantFlow ? "Добавить как свой вариант" : "Добавить в запасы",
    noticeText: isDerivedVariantFlow ? "Сохранится как ваш измененный вариант ингредиента." : null,
    inlineHelper: isDerivedVariantFlow ? "Каталог не изменится." : null
  };
};

const buildInitialBatchOverridesFromSelection = (
  selected: IngredientSuggestionItem | null
): CatalogBatchOverrideFields => {
  const defaults = resolveCatalogBatchOverrideDefaults(selected);
  if (!defaults) {
    return createInitialCatalogBatchOverrideFields();
  }

  if (defaults.kind === "fermentable") {
    return {
      fermentableColorEbc: defaults.fermentableColorEbc,
      fermentableExtractYieldPct: defaults.fermentableExtractYieldPct,
      hopAlphaAcidPct: ""
    };
  }

  return {
    fermentableColorEbc: "",
    fermentableExtractYieldPct: "",
    hopAlphaAcidPct: defaults.hopAlphaAcidPct
  };
};

const resolveInitialSelectionForContext = ({
  category,
  subtype,
  initialSelection
}: {
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  initialSelection?: IngredientSuggestionItem | null;
}) => {
  if (!initialSelection) {
    return null;
  }

  if (category && initialSelection.category && initialSelection.category !== category) {
    return null;
  }

  if (
    category === "fermentable"
    && subtype
    && initialSelection.subtype
    && initialSelection.subtype !== subtype
  ) {
    return null;
  }

  return initialSelection;
};

export const resolveCatalogPickerContextChange = ({
  currentPickerValue,
  currentSelected,
  nextSelection
}: {
  currentPickerValue: string;
  currentSelected: IngredientSuggestionItem | null;
  nextSelection: IngredientSuggestionItem | null;
}) => {
  if (nextSelection) {
    return {
      pickerValue: resolveIngredientDisplayNames(nextSelection).primaryName,
      shouldRefocus: false
    };
  }

  if (currentSelected) {
    return {
      pickerValue: "",
      shouldRefocus: false
    };
  }

  return {
    pickerValue: currentPickerValue,
    shouldRefocus: Boolean(currentPickerValue.trim())
  };
};

export const resolveCatalogIngredientUnitProfile = (
  category?: IngredientCategory,
  selected?: IngredientSuggestionItem | null
) => resolveHumanFacingInventoryUnitProfile({
  type: selected?.type,
  category: selected?.category ?? category,
  subtype: selected?.subtype ?? null,
  defaultDisplayUnit: selected?.defaultDisplayUnit ?? selected?.defaultUnit,
  allowedUnits: selected?.allowedUnits,
  measurementDimension: selected?.measurementDimension,
  technicalData: selected?.technicalData ?? null
});

export const buildCatalogIngredientPayload = (
  selected: IngredientSuggestionItem | null,
  fields: InventoryCommonFields,
  options?: {
    includeOptionalDetails?: boolean;
    batchOverrides?: Partial<CatalogBatchOverrideFields> | null;
  }
): CatalogIngredientSubmitPayload => {
  if (!selected?.id) {
    throw new Error("CATALOG_SELECTION_REQUIRED");
  }

  const includeOptionalDetails = options?.includeOptionalDetails ?? true;
  const payload: CatalogIngredientSubmitPayload = {
    ingredientCatalogItemId: selected.source === "catalog" ? selected.id : undefined,
    userCustomIngredientId: selected.source === "custom" ? selected.id : undefined,
    enteredQuantity: fields.enteredQuantity,
    enteredUnit: fields.enteredUnit
  };

  if (includeOptionalDetails) {
    payload.priceInputMode = fields.priceInputMode;
    payload.priceInputAmount = fields.priceInputAmount;
    payload.purchasedAt = fields.purchasedAt;
    payload.freshnessDate = fields.freshnessDate;
    payload.notes = fields.notes;
  }

  const batchOverrides = options?.batchOverrides;
  if (batchOverrides?.fermentableColorEbc?.trim()) {
    payload.fermentableColorEbc = batchOverrides.fermentableColorEbc;
  }
  if (batchOverrides?.fermentableExtractYieldPct?.trim()) {
    payload.fermentableExtractYieldPct = batchOverrides.fermentableExtractYieldPct;
  }
  if (batchOverrides?.hopAlphaAcidPct?.trim()) {
    payload.hopAlphaAcidPct = batchOverrides.hopAlphaAcidPct;
  }

  return payload;
};

export function CatalogIngredientForm({
  category,
  subtype,
  preferredCurrency,
  pending,
  autoFocus = false,
  initialSelection = null,
  fieldErrors,
  hidePicker = false,
  selectionActionLabel = "Изменить ингредиент",
  onSubmit,
  onRequestCustom,
  onSelectionCleared,
  onSelectedIngredientChange
}: Props) {
  const [selected, setSelected] = useState<IngredientSuggestionItem | null>(() => resolveInitialSelectionForContext({
    category,
    subtype,
    initialSelection
  }));
  const [pickerValue, setPickerValue] = useState(() => {
    const resolvedSelection = resolveInitialSelectionForContext({
      category,
      subtype,
      initialSelection
    });
    return resolvedSelection ? resolveIngredientDisplayNames(resolvedSelection).primaryName : "";
  });
  const [fields, setFields] = useState<InventoryCommonFields>(() => createInitialCommonFields(category));
  const [batchOverrides, setBatchOverrides] = useState<CatalogBatchOverrideFields>(() => buildInitialBatchOverridesFromSelection(
    resolveInitialSelectionForContext({
      category,
      subtype,
      initialSelection
    })
  ));
  const [batchOverrideMode, setBatchOverrideMode] = useState<"catalog" | "customize">("catalog");
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [optionalTouched, setOptionalTouched] = useState(false);
  const [purchaseLinksState, setPurchaseLinksState] = useState<{ urls: string[]; isLoaded: boolean }>({
    urls: [],
    isLoaded: false
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const [pickerFocusSignal, setPickerFocusSignal] = useState(0);
  const previousContextRef = useRef<{
    category?: IngredientCategory;
    subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
    initialSelectionId: string | null;
  } | null>(null);
  const selectedRef = useRef<IngredientSuggestionItem | null>(selected);
  const pickerValueRef = useRef(pickerValue);
  const unitProfile = resolveCatalogIngredientUnitProfile(category, selected);
  const quantityStep = getInventoryUnitInputStep(fields.enteredUnit);
  const selectedPackEquivalent = selected ? resolveInventoryPackEquivalent(selected.technicalData ?? null) : null;
  const batchOverrideDefaults = resolveCatalogBatchOverrideDefaults(selected);
  const showRequiredInventoryBlock = shouldShowCatalogRequiredInventoryBlock(selected);
  const showBatchOverrideSection = shouldShowCatalogBatchOverrideSection(selected);
  const showOptionalSection = shouldShowCatalogOptionalSection(selected);
  const showPickerStage = shouldShowCatalogPickerStage({
    category,
    hidePicker,
    selected
  });
  const hasTechnicalOverrides = hasCatalogIngredientTechnicalOverrides({
    selected,
    overrides: batchOverrides
  });
  const overrideSummaryState = resolveCatalogBatchOverrideSummaryState({
    defaults: batchOverrideDefaults,
    overrides: batchOverrides,
    hasTechnicalOverrides
  });
  const derivedVariantPresentation = resolveCatalogDerivedVariantPresentation({
    selected,
    hasTechnicalOverrides
  });

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    pickerValueRef.current = pickerValue;
  }, [pickerValue]);

  useEffect(() => {
    const resolvedSelection = resolveInitialSelectionForContext({
      category,
      subtype,
      initialSelection
    });
    const previousContext = previousContextRef.current;
    const nextContext = {
      category,
      subtype,
      initialSelectionId: initialSelection?.id ?? null
    };

    previousContextRef.current = nextContext;

    const resetFormState = ({
      nextSelection,
      nextPickerValue,
      shouldRefocusPicker = false
    }: {
      nextSelection: IngredientSuggestionItem | null;
      nextPickerValue: string;
      shouldRefocusPicker?: boolean;
    }) => {
      setSelected(nextSelection);
      onSelectedIngredientChange?.(nextSelection);
      setPickerValue(nextPickerValue);
      setFields(createInitialCommonFields(category));
      setBatchOverrides(buildInitialBatchOverridesFromSelection(nextSelection));
      setBatchOverrideMode("catalog");
      setOptionalOpen(false);
      setOptionalTouched(false);
      setPurchaseLinksState({
        urls: [],
        isLoaded: false
      });
      setLocalError(null);

      if (shouldRefocusPicker) {
        setPickerFocusSignal((current) => current + 1);
      }
    };

    if (!previousContext) {
      resetFormState({
        nextSelection: resolvedSelection,
        nextPickerValue: resolvedSelection ? resolveIngredientDisplayNames(resolvedSelection).primaryName : ""
      });
      return;
    }

    const didInitialSelectionChange = previousContext.initialSelectionId !== nextContext.initialSelectionId;
    if (didInitialSelectionChange) {
      resetFormState({
        nextSelection: resolvedSelection,
        nextPickerValue: resolvedSelection ? resolveIngredientDisplayNames(resolvedSelection).primaryName : ""
      });
      return;
    }

    const didContextChange = previousContext.category !== nextContext.category || previousContext.subtype !== nextContext.subtype;
    if (!didContextChange) {
      return;
    }

    const nextPickerState = resolveCatalogPickerContextChange({
      currentPickerValue: pickerValueRef.current,
      currentSelected: selectedRef.current,
      nextSelection: resolvedSelection
    });

    resetFormState({
      nextSelection: resolvedSelection,
      nextPickerValue: nextPickerState.pickerValue,
      shouldRefocusPicker: nextPickerState.shouldRefocus
    });
  }, [category, initialSelection, subtype]);

  useEffect(() => {
    const resolvedSelection = resolveInitialSelectionForContext({
      category,
      subtype,
      initialSelection
    });

    if (!resolvedSelection) {
      return;
    }

    const nextUnitProfile = resolveCatalogIngredientUnitProfile(category, resolvedSelection);
    setFields((current) => ({
      ...current,
      enteredUnit: nextUnitProfile.defaultUnit
    }));
  }, [category, initialSelection, subtype]);

  useEffect(() => {
    const hasOptionalErrors = Boolean(
      fieldErrors?.priceInputAmountMinor
      || fieldErrors?.purchasePriceMinor
      || fieldErrors?.purchasePrice
      || fieldErrors?.purchasedAt
      || fieldErrors?.freshnessDate
      || fieldErrors?.notes
    );
    const hasOverrideErrors = Boolean(
      fieldErrors?.fermentableColorEbc
      || fieldErrors?.fermentableExtractYieldPct
      || fieldErrors?.hopAlphaAcidPct
    );

    if (hasOptionalErrors) {
      setOptionalOpen(true);
      setOptionalTouched(true);
    }

    if (hasOverrideErrors) {
      setBatchOverrideMode("customize");
    }
  }, [fieldErrors]);

  const purchasePriceError = fieldErrors?.priceInputAmountMinor ?? fieldErrors?.purchasePriceMinor ?? fieldErrors?.purchasePrice;
  const clearSelectedIngredient = () => {
    onSelectionCleared?.();
    const resetState = resolveCatalogSelectionResetState({ hidePicker });
    setSelected(null);
    onSelectedIngredientChange?.(null);
    setPickerValue(resetState.pickerValue);
    setLocalError(null);
    setBatchOverrides(createInitialCatalogBatchOverrideFields());
    setBatchOverrideMode("catalog");
    setOptionalOpen(false);
    setOptionalTouched(false);
    setPurchaseLinksState({
      urls: [],
      isLoaded: false
    });
    const resetProfile = resolveCatalogIngredientUnitProfile(category, null);
    setFields((current) => ({
      ...current,
      enteredUnit: resetProfile.defaultUnit
    }));

    if (resetState.shouldRefocus) {
      setPickerFocusSignal((current) => current + 1);
    }
  };

  const toggleBatchOverrideEditor = () => {
    setBatchOverrideMode((current) => (
      current === "customize" ? "catalog" : "customize"
    ));
  };

  const toggleOptionalSection = () => {
    setOptionalOpen((current) => {
      const nextOpen = !current;
      if (nextOpen) {
        setOptionalTouched(true);
      }

      return nextOpen;
    });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          const payload = buildCatalogIngredientPayload(selected, fields, {
            includeOptionalDetails: optionalTouched,
            batchOverrides: batchOverrideMode === "customize" ? batchOverrides : null
          });
          if (optionalTouched && purchaseLinksState.isLoaded) {
            payload.purchaseLinksTouched = true;
            payload.purchaseLinks = purchaseLinksState.urls;
          }
          setLocalError(null);
          await onSubmit(payload);
        } catch (error) {
          if (error instanceof Error && error.message === "CATALOG_SELECTION_REQUIRED") {
            setLocalError("Выберите ингредиент из каталога.");
            return;
          }

          throw error;
        }
      }}
    >
      {showPickerStage ? (
        <section className="space-y-2" data-testid="catalog-picker-stage">
          <label className="text-sm font-medium text-zinc-900">Ингредиент</label>
          <IngredientPicker
            value={pickerValue}
            category={category}
            subtype={subtype}
            enableQuickStart
            allowCustomOnlyFilter
            autoFocus={autoFocus}
            focusSignal={pickerFocusSignal}
            onValueChange={(nextValue) => {
              setPickerValue(nextValue);
              setLocalError(null);
            }}
            onSelect={(item) => {
              setSelected(item);
              onSelectedIngredientChange?.(item);
              setPickerValue(resolveIngredientDisplayNames(item).primaryName);
              setLocalError(null);
              setBatchOverrides(buildInitialBatchOverridesFromSelection(item));
              setBatchOverrideMode("catalog");
              const nextUnitProfile = resolveCatalogIngredientUnitProfile(category, item);
              setFields((current) => {
                return {
                  ...current,
                  enteredUnit: nextUnitProfile.defaultUnit
                };
              });
            }}
            placeholder="Начните вводить название ингредиента"
            emptyCta={({ hasActiveFilters, resetFilters }) => (
              <div className="space-y-3">
                <p className="text-sm text-zinc-700">
                  Ничего не нашли. Попробуйте сменить категорию
                  {hasActiveFilters ? " или сбросить фильтры" : ""}
                  , либо добавьте свой ингредиент.
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
                  <button
                    type="button"
                    onClick={onRequestCustom}
                    className="inline-flex items-center rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                  >
                    Добавить свой ингредиент
                  </button>
                </div>
              </div>
            )}
          />
          {(localError || fieldErrors?.ingredientCatalogItemId) && <p className="text-xs text-red-600">{localError ?? fieldErrors?.ingredientCatalogItemId}</p>}
        </section>
      ) : null}

      {selected ? (
        <section className="space-y-3" data-testid="catalog-selection-stage">
          <div className="space-y-2">
            <IngredientSelectionCard
              item={selected}
              actionLabel={selectionActionLabel}
              onAction={clearSelectedIngredient}
              hideTypedSummary
              hideSubtitle
              mergeBrandAndCountry
              statusBadgeLabel={overrideSummaryState.statusBadgeLabel}
              details={showBatchOverrideSection && batchOverrideDefaults ? (
                <div className="space-y-3" data-testid="catalog-batch-overrides">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-700">
                    {overrideSummaryState.currentEntries.map((entry) => (
                      <span key={entry.label}>
                        {entry.label}: <span className="font-medium text-zinc-950">{entry.value}</span>
                      </span>
                    ))}
                    <span aria-hidden="true" className="text-zinc-300">•</span>
                    <button
                      type="button"
                      onClick={toggleBatchOverrideEditor}
                      className="inline-flex items-center text-sm font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-zinc-950"
                    >
                      {batchOverrideMode === "customize" ? "Готово" : "Уточнить параметры"}
                    </button>
                  </div>

                  {overrideSummaryState.catalogEntries ? (
                    <p className="text-xs text-zinc-500">
                      В каталоге: {overrideSummaryState.catalogEntries.map((entry) => `${entry.label} ${entry.value}`).join(", ")}
                    </p>
                  ) : null}

                  {batchOverrideMode === "customize" && batchOverrideDefaults.kind === "fermentable" ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="text-sm">Цвет, EBC
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          className="mt-1 w-full rounded-md border px-2 py-2"
                          value={batchOverrides.fermentableColorEbc}
                          onChange={(event) => setBatchOverrides((current) => ({
                            ...current,
                            fermentableColorEbc: event.target.value
                          }))}
                          inputMode="decimal"
                        />
                        {fieldErrors?.fermentableColorEbc && <span className="text-xs text-red-600">{fieldErrors.fermentableColorEbc}</span>}
                      </label>

                      <label className="text-sm">Экстрактивность, %
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          className="mt-1 w-full rounded-md border px-2 py-2"
                          value={batchOverrides.fermentableExtractYieldPct}
                          onChange={(event) => setBatchOverrides((current) => ({
                            ...current,
                            fermentableExtractYieldPct: event.target.value
                          }))}
                          inputMode="decimal"
                        />
                        {fieldErrors?.fermentableExtractYieldPct && <span className="text-xs text-red-600">{fieldErrors.fermentableExtractYieldPct}</span>}
                      </label>
                    </div>
                  ) : null}

                  {batchOverrideMode === "customize" && batchOverrideDefaults.kind === "hop" ? (
                    <div className="grid grid-cols-1 gap-3 sm:max-w-xs">
                      <label className="text-sm">Альфа-кислота, %
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          className="mt-1 w-full rounded-md border px-2 py-2"
                          value={batchOverrides.hopAlphaAcidPct}
                          onChange={(event) => setBatchOverrides((current) => ({
                            ...current,
                            hopAlphaAcidPct: event.target.value
                          }))}
                          inputMode="decimal"
                        />
                        {fieldErrors?.hopAlphaAcidPct && <span className="text-xs text-red-600">{fieldErrors.hopAlphaAcidPct}</span>}
                      </label>
                    </div>
                  ) : null}

                  {batchOverrideMode === "customize" && derivedVariantPresentation.inlineHelper ? (
                    <p className="text-xs text-zinc-500">{derivedVariantPresentation.inlineHelper}</p>
                  ) : null}
                </div>
              ) : null}
            />
            {selectedPackEquivalent ? (
              <p className="text-xs text-zinc-500">
                1 pack = {selectedPackEquivalent.normalizedQuantity} {selectedPackEquivalent.normalizedUnit}
              </p>
            ) : null}
            {derivedVariantPresentation.noticeText ? (
              <p
                className="text-xs text-zinc-500"
                data-testid="catalog-derived-variant-notice"
              >
                {derivedVariantPresentation.noticeText}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {showRequiredInventoryBlock ? (
        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4" data-testid="catalog-required-fields">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">Количество *
              <input
                type="number"
                min="0"
                step={quantityStep}
                className="mt-1 w-full rounded-md border px-2 py-2"
                value={fields.enteredQuantity}
                onChange={(e) => setFields((s) => ({ ...s, enteredQuantity: e.target.value }))}
                inputMode="decimal"
              />
              {fieldErrors?.enteredQuantity && <span className="text-xs text-red-600">{fieldErrors.enteredQuantity}</span>}
            </label>

            <label className="text-sm">Ед. изм. *
              <select
                className="mt-1 w-full rounded-md border px-2 py-2"
                value={fields.enteredUnit}
                onChange={(e) => setFields((s) => ({ ...s, enteredUnit: e.target.value as InventoryUnit }))}
              >
                {unitProfile.allowedUnits.map((unit) => <option key={unit} value={unit}>{inventoryUnitLabels[unit]}</option>)}
              </select>
              {fieldErrors?.enteredUnit && <span className="text-xs text-red-600">{fieldErrors.enteredUnit}</span>}
            </label>
          </div>
        </section>
      ) : null}

      {showOptionalSection ? (
        <InventoryOptionalDisclosure
          open={optionalOpen}
          onToggle={toggleOptionalSection}
          fields={{
            ...fields,
            purchaseLinksCount: purchaseLinksState.urls.length
          }}
          preferredCurrency={preferredCurrency}
          testId="catalog-optional-disclosure"
        >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-sm">Дата покупки
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="date"
                      className="w-full rounded-md border px-2 py-2"
                      value={fields.purchasedAt}
                      onChange={(e) => setFields((s) => ({ ...s, purchasedAt: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="rounded-md border border-zinc-200 px-2 py-2 text-xs text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                      onClick={() => setFields((s) => ({ ...s, purchasedAt: "" }))}
                      aria-label="Очистить дату покупки"
                    >
                      ×
                    </button>
                  </div>
                </label>

                <label className="text-sm">Годен до
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border px-2 py-2"
                    value={fields.freshnessDate}
                    onChange={(e) => setFields((s) => ({ ...s, freshnessDate: e.target.value }))}
                  />
                </label>
              </div>

              <InventoryPriceInput
                preferredCurrency={preferredCurrency}
                priceInputMode={fields.priceInputMode}
                priceInputAmount={fields.priceInputAmount}
                enteredQuantity={fields.enteredQuantity}
                enteredUnit={fields.enteredUnit}
                fieldError={purchasePriceError}
                onPriceInputModeChange={(mode) => setFields((current) => ({ ...current, priceInputMode: mode }))}
                onPriceInputAmountChange={(value) => setFields((current) => ({ ...current, priceInputAmount: value }))}
                type={selected?.type}
                category={selected?.category ?? category}
                subtype={selected?.subtype ?? null}
                defaultDisplayUnit={selected?.defaultDisplayUnit ?? selected?.defaultUnit}
                allowedUnits={selected?.allowedUnits}
                measurementDimension={selected?.measurementDimension}
                technicalData={selected?.technicalData ?? null}
              />

              <IngredientPurchaseLinksField
                reference={selected ? {
                  source: selected.source,
                  id: selected.id
                } : null}
                enabled={optionalOpen}
                onStateChange={setPurchaseLinksState}
                testId="catalog-purchase-links-field"
              />

              <label className="block text-sm">Заметки
                <textarea
                  className="mt-1 h-20 w-full rounded-md border px-2 py-2"
                  value={fields.notes}
                  onChange={(e) => setFields((s) => ({ ...s, notes: e.target.value }))}
                />
              </label>
            </div>
        </InventoryOptionalDisclosure>
      ) : null}

      {selected ? (
        <button type="submit" disabled={pending} className="w-full rounded-md bg-black px-4 py-2.5 text-sm text-white disabled:opacity-60">
          {pending ? "Сохранение..." : derivedVariantPresentation.submitLabel}
        </button>
      ) : null}
    </form>
  );
}
