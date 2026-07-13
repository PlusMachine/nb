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
import { NumericInput } from "@/components/shared/numeric-input";
import type {
  IngredientCategory,
  IngredientConsumableGroupRefinement,
  IngredientPickerQuickStartAvailability,
  IngredientPickerQuickStartResult,
  IngredientTechnicalData,
  IngredientSubtype,
  IngredientSuggestionItem
} from "@/features/ingredients/contracts";
import {
  consumableInventoryAdditiveGroups,
  consumableInventorySupplyGroups,
  isConsumableInventoryBroadGroup,
  resolveConsumableInventoryBroadGroup,
  resolveConsumableInventoryBroadGroupLabel,
  resolveConsumablePickerGroupLabel
} from "@/features/ingredients/consumables";
import {
  ingredientPickerFermentableQuickStartGroupOrder,
  resolveFermentableQuickStartGroupLabel
} from "@/features/ingredients/picker-quick-start";
import { resolveIngredientDisplayNames } from "@/features/ingredients/presentation";
import { resolveIngredientTechnicalDataColorRangeEbc } from "@/features/ingredients/technical-fields";
import { isWaterTreatmentAcidLike, readWaterTreatmentConcentrationPct } from "@/features/ingredients/water-treatment";
import { inventoryFermentableSubtypeLabels } from "@/features/inventory/page-model";
import type { InventoryPriceInputMode } from "@/features/inventory/purchase-cost";
import {
  inventoryUnitLabels,
  resolveHumanFacingInventoryUnitProfile,
  type InventoryUnit
} from "@/features/inventory/units";
import { resolveInventoryPackEquivalent } from "@/features/inventory/pack";
import type { SystemCurrency } from "@/features/system/currency";
import { hasValidationErrors, validateNumericInput } from "@/features/forms/numeric-validation";

type InventoryCommonFields = InventoryOptionalFieldsState & {
  enteredQuantity: string;
  enteredUnit: InventoryUnit;
};

export type CatalogBatchOverrideFields = {
  fermentableColorEbc: string;
  fermentableExtractYieldPct: string;
  hopAlphaAcidPct: string;
  waterTreatmentConcentrationPct: string;
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
  waterTreatmentConcentrationPct?: string;
  purchaseLinks?: string[];
  purchaseLinksTouched?: boolean;
};

type Props = {
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  initialQuickStartData?: IngredientPickerQuickStartResult | null;
  initialQuickStartAvailability?: IngredientPickerQuickStartAvailability | null;
  preferredCurrency: SystemCurrency;
  pending: boolean;
  autoFocus?: boolean;
  initialSelection?: IngredientSuggestionItem | null;
  /** Дефицит из «Чего не хватает» (UX-находка #20): предзаполнить количество/единицу.
   *  Применяется один раз при монтировании и только если единица допустима. */
  initialQuantity?: string | null;
  initialUnit?: string | null;
  fieldErrors?: Record<string, string>;
  hidePicker?: boolean;
  selectionActionLabel?: string;
  forcedGroup?: string | null;
  onSubmit: (payload: CatalogIngredientSubmitPayload) => Promise<void>;
  onRequestCustom: () => void;
  onSelectionCleared?: () => void;
  onSelectedIngredientChange?: (selected: IngredientSuggestionItem | null) => void;
  onSubtypeChange?: (subtype: Extract<IngredientSubtype, "malt" | "fermentable">) => void;
  onGroupChange?: (group: string | null) => void;
  /** Не сохранённые данные — для guard'а модалки-обёртки (закрыть без подтверждения?). */
  onDirtyChange?: (dirty: boolean) => void;
};

/**
 * "Грязна" ли форма (для guard'а обёртки-модалки): выбран ингредиент, введён поисковый
 * текст, указано количество, либо тронуты необязательные поля/ссылки на покупку.
 */
export const isCatalogIngredientFormDirty = ({
  selected,
  pickerValue,
  enteredQuantity,
  optionalTouched,
  priceInputAmount,
  purchasedAt,
  freshnessDate,
  notes,
  purchaseLinksCount
}: {
  selected: IngredientSuggestionItem | null;
  pickerValue: string;
  enteredQuantity: string;
  optionalTouched: boolean;
  priceInputAmount: string;
  purchasedAt: string;
  freshnessDate: string;
  notes: string;
  purchaseLinksCount: number;
}) => {
  if (selected) {
    return true;
  }

  if (pickerValue.trim() || enteredQuantity.trim()) {
    return true;
  }

  return optionalTouched && Boolean(
    priceInputAmount.trim() || purchasedAt.trim() || freshnessDate.trim() || notes.trim() || purchaseLinksCount > 0
  );
};

const createInitialCommonFields = (category?: IngredientCategory): InventoryCommonFields => {
  const unitProfile = resolveHumanFacingInventoryUnitProfile({ category });
  return {
    enteredQuantity: "",
    enteredUnit: unitProfile.defaultUnit,
    ...createInitialInventoryOptionalFields()
  };
};

const fermentableChipValues = [
  "malt",
  ...ingredientPickerFermentableQuickStartGroupOrder
] as const;

const resolveConsumablePickerBroadGroup = (group?: string | null) => {
  if (!group) {
    return null;
  }

  return isConsumableInventoryBroadGroup(group)
    ? group
    : resolveConsumableInventoryBroadGroup({
      sourceCategory: group
    });
};

export const resolveVisibleConsumableCatalogGroupSwitchValues = ({
  activeConsumableBroadGroup,
  initialQuickStartData,
  forcedGroup
}: {
  activeConsumableBroadGroup: "inventory_supplies" | "inventory_additives" | null;
  initialQuickStartData?: IngredientPickerQuickStartResult | null;
  forcedGroup?: string | null;
}) => {
  if (!activeConsumableBroadGroup) {
    return [];
  }

  const baseGroups = activeConsumableBroadGroup === "inventory_supplies"
    ? consumableInventorySupplyGroups
    : consumableInventoryAdditiveGroups;
  const quickStartGroupCoverage = new Set(
    (initialQuickStartData?.groups ?? [])
      .filter((group) => group.count > 0)
      .map((group) => group.value)
  );

  return baseGroups.filter((value) => (
    value !== "other"
    || forcedGroup === value
    || quickStartGroupCoverage.has(value)
  ));
};

export const createInitialCatalogBatchOverrideFields = (): CatalogBatchOverrideFields => ({
  fermentableColorEbc: "",
  fermentableExtractYieldPct: "",
  hopAlphaAcidPct: "",
  waterTreatmentConcentrationPct: ""
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

const validateCatalogIngredientNumbers = ({
  fields,
  batchOverrides,
  batchOverrideDefaults,
  batchOverrideMode
}: {
  fields: InventoryCommonFields;
  batchOverrides: CatalogBatchOverrideFields;
  batchOverrideDefaults: CatalogBatchOverrideDefaults | null;
  batchOverrideMode: "catalog" | "customize";
}) => {
  const errors: Record<string, string | null> = {
    enteredQuantity: validateNumericInput(fields.enteredQuantity, {
      label: "Количество",
      required: true,
      min: 0,
      exclusiveMin: true
    })
  };

  if (!batchOverrideDefaults) {
    return errors;
  }

  const shouldValidateOverrides =
    batchOverrideMode === "customize" ||
    batchOverrideDefaults.kind === "water_treatment_acid";

  if (!shouldValidateOverrides) {
    return errors;
  }

  if (batchOverrideDefaults.kind === "fermentable") {
    errors.fermentableColorEbc = validateNumericInput(batchOverrides.fermentableColorEbc, {
      label: "Цвет EBC",
      min: 0,
      max: 9999
    });
    errors.fermentableExtractYieldPct = validateNumericInput(batchOverrides.fermentableExtractYieldPct, {
      label: "Экстрактивность",
      min: 0,
      max: 100
    });
  } else if (batchOverrideDefaults.kind === "hop") {
    errors.hopAlphaAcidPct = validateNumericInput(batchOverrides.hopAlphaAcidPct, {
      label: "Альфа-кислота",
      min: 0,
      max: 100
    });
  } else {
    errors.waterTreatmentConcentrationPct = validateNumericInput(batchOverrides.waterTreatmentConcentrationPct, {
      label: "Концентрация кислоты",
      min: 0,
      max: 100,
      exclusiveMin: true
    });
  }

  return errors;
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

const isWaterTreatmentTechnicalData = (
  technicalData: IngredientTechnicalData | null | undefined
): technicalData is Extract<IngredientTechnicalData, { type: "water_treatment" }> => (
  technicalData?.type === "water_treatment"
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
  }
  | {
    kind: "water_treatment_acid";
    waterTreatmentConcentrationPct: string;
    concentrationPct: number | null;
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

  if (
    isWaterTreatmentTechnicalData(selected.technicalData)
    && isWaterTreatmentAcidLike(selected)
  ) {
    const concentrationPct = readWaterTreatmentConcentrationPct(selected.technicalData);

    return {
      kind: "water_treatment_acid",
      waterTreatmentConcentrationPct: formatInputNumber(concentrationPct),
      concentrationPct
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

  if (defaults.kind === "hop") {
    return !numbersEqual(parseInputNumber(overrides.hopAlphaAcidPct), defaults.alphaAcidPct);
  }

  return !numbersEqual(parseInputNumber(overrides.waterTreatmentConcentrationPct), defaults.concentrationPct);
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

  if (defaults.kind === "hop") {
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
  }

  const currentConcentration = formatCatalogBatchNumber(
    hasTechnicalOverrides
      ? overrides.waterTreatmentConcentrationPct
      : defaults.waterTreatmentConcentrationPct,
    "%"
  ) ?? "Концентрация не указана";
  const catalogConcentration =
    formatCatalogBatchNumber(defaults.waterTreatmentConcentrationPct, "%") ??
    "Концентрация не указана";

  return {
    currentEntries: [
      { label: "Концентрация", value: currentConcentration }
    ],
    catalogEntries: hasTechnicalOverrides
      ? [
        { label: "Концентрация", value: catalogConcentration }
      ]
      : null,
    statusBadgeLabel: hasTechnicalOverrides ? "УТОЧНЕНО" : null
  };
};

export const resolveCatalogDerivedVariantPresentation = ({
  selected,
  hasTechnicalOverrides
}: {
  selected: IngredientSuggestionItem | null;
  hasTechnicalOverrides: boolean;
}) => {
  const defaults = resolveCatalogBatchOverrideDefaults(selected);
  const isDerivedVariantFlow = Boolean(
    selected?.source === "catalog"
    && hasTechnicalOverrides
    && defaults?.kind !== "water_treatment_acid"
  );

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
      hopAlphaAcidPct: "",
      waterTreatmentConcentrationPct: ""
    };
  }

  if (defaults.kind === "hop") {
    return {
      fermentableColorEbc: "",
      fermentableExtractYieldPct: "",
      hopAlphaAcidPct: defaults.hopAlphaAcidPct,
      waterTreatmentConcentrationPct: ""
    };
  }

  return {
    fermentableColorEbc: "",
    fermentableExtractYieldPct: "",
    hopAlphaAcidPct: "",
    waterTreatmentConcentrationPct: defaults.waterTreatmentConcentrationPct
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
  if (batchOverrides?.waterTreatmentConcentrationPct?.trim()) {
    payload.waterTreatmentConcentrationPct = batchOverrides.waterTreatmentConcentrationPct;
  }

  return payload;
};

export function CatalogIngredientForm({
  category,
  subtype,
  initialQuickStartData = null,
  initialQuickStartAvailability = null,
  preferredCurrency,
  pending,
  autoFocus = false,
  initialSelection = null,
  initialQuantity = null,
  initialUnit = null,
  fieldErrors,
  hidePicker = false,
  selectionActionLabel = "Изменить ингредиент",
  forcedGroup = null,
  onSubmit,
  onRequestCustom,
  onSelectionCleared,
  onSelectedIngredientChange,
  onSubtypeChange,
  onGroupChange,
  onDirtyChange
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
  const [localFieldErrors, setLocalFieldErrors] = useState<Record<string, string | null>>({});
  const [pickerFocusSignal, setPickerFocusSignal] = useState(0);
  const previousContextRef = useRef<{
    category?: IngredientCategory;
    subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
    initialSelectionId: string | null;
  } | null>(null);
  const selectedRef = useRef<IngredientSuggestionItem | null>(selected);
  const pickerValueRef = useRef(pickerValue);
  const unitProfile = resolveCatalogIngredientUnitProfile(category, selected);
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
  const activeConsumableBroadGroup = category === "consumable"
    ? resolveConsumablePickerBroadGroup(forcedGroup)
    : null;
  const visibleConsumableGroupSwitchValues = resolveVisibleConsumableCatalogGroupSwitchValues({
    activeConsumableBroadGroup,
    initialQuickStartData,
    forcedGroup
  });
  const forcedGroupRefinement: IngredientConsumableGroupRefinement | null = forcedGroup
    ? {
      type: "consumable_group",
      label: activeConsumableBroadGroup && isConsumableInventoryBroadGroup(forcedGroup)
        ? (resolveConsumableInventoryBroadGroupLabel(forcedGroup) ?? forcedGroup)
        : resolveConsumablePickerGroupLabel(forcedGroup) ?? resolveConsumableInventoryBroadGroupLabel(forcedGroup) ?? forcedGroup,
      normalizedLabel: forcedGroup,
      value: forcedGroup,
      count: 0,
      score: 0
    }
    : null;
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
    onDirtyChange?.(isCatalogIngredientFormDirty({
      selected,
      pickerValue,
      enteredQuantity: fields.enteredQuantity,
      optionalTouched,
      priceInputAmount: fields.priceInputAmount,
      purchasedAt: fields.purchasedAt,
      freshnessDate: fields.freshnessDate,
      notes: fields.notes,
      purchaseLinksCount: purchaseLinksState.urls.length
    }));
  }, [
    onDirtyChange,
    selected,
    pickerValue,
    fields.enteredQuantity,
    optionalTouched,
    fields.priceInputAmount,
    fields.purchasedAt,
    fields.freshnessDate,
    fields.notes,
    purchaseLinksState.urls.length
  ]);

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
      setLocalFieldErrors({});

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

  // Дефицит из «Чего не хватает» (UX-находка #20): один раз при монтировании (после
  // mount-эффектов сброса выше, поэтому объявлен ПОСЛЕ них) подставляем количество
  // и единицу. Гард по ref — не переприменяем при смене контекста пользователем;
  // гард по allowedUnits — не подставляем число в единицу, которой у ингредиента
  // нет (иначе величина исказилась бы: 500 г → 500 пачек).
  const initialAmountAppliedRef = useRef(false);
  useEffect(() => {
    if (initialAmountAppliedRef.current) return;
    const quantity = (initialQuantity ?? "").trim();
    if (!quantity || !initialUnit) return;
    initialAmountAppliedRef.current = true;
    const profile = resolveCatalogIngredientUnitProfile(category, selectedRef.current);
    if (!profile.allowedUnits?.includes(initialUnit as InventoryUnit)) return;
    setFields((current) => ({
      ...current,
      enteredQuantity: quantity,
      enteredUnit: initialUnit as InventoryUnit
    }));
  }, [category, initialQuantity, initialUnit]);

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
      || fieldErrors?.waterTreatmentConcentrationPct
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
    setLocalFieldErrors({});
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
      // Смена ингредиента обнуляет и количество: иначе предзаполненный из списка
      // покупок дефицит ингредиента A утёк бы в ингредиент B в его единице (#20-ревью).
      enteredQuantity: "",
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
          const shouldIncludeBatchOverrides =
            batchOverrideMode === "customize" ||
            batchOverrideDefaults?.kind === "water_treatment_acid";
          const nextFieldErrors = validateCatalogIngredientNumbers({
            fields,
            batchOverrides,
            batchOverrideDefaults,
            batchOverrideMode
          });
          setLocalFieldErrors(nextFieldErrors);
          if (hasValidationErrors(nextFieldErrors)) {
            return;
          }
          const payload = buildCatalogIngredientPayload(selected, fields, {
            includeOptionalDetails: optionalTouched,
            batchOverrides: shouldIncludeBatchOverrides ? batchOverrides : null
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
          {category === "fermentable" && onSubtypeChange ? (
            <div className="flex flex-wrap gap-2" data-testid="catalog-fermentable-subtype-switch">
              {fermentableChipValues.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    if (value === "malt") {
                      onSubtypeChange("malt");
                      onGroupChange?.(null);
                      return;
                    }

                    onSubtypeChange("fermentable");
                    onGroupChange?.(value);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    (value === "malt" && subtype === "malt" && !forcedGroup)
                    || (value !== "malt" && subtype === "fermentable" && forcedGroup === value)
                      ? "border-warning/30 bg-warning-subtle text-warning-subtle-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-border hover:bg-muted"
                  }`}
                >
                  {value === "malt" ? inventoryFermentableSubtypeLabels.malt : resolveFermentableQuickStartGroupLabel(value)}
                </button>
              ))}
            </div>
          ) : null}
          {category === "consumable" && activeConsumableBroadGroup ? (
            <div className="flex flex-wrap gap-2" data-testid="catalog-consumable-group-switch">
              {visibleConsumableGroupSwitchValues.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onGroupChange?.(forcedGroup === value ? activeConsumableBroadGroup : value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    forcedGroup === value
                      ? "border-warning/30 bg-warning-subtle text-warning-subtle-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-border hover:bg-muted"
                  }`}
                >
                  {resolveConsumablePickerGroupLabel(value) ?? value}
                </button>
              ))}
            </div>
          ) : null}
          <label className="text-sm font-medium text-foreground">Ингредиент</label>
          <IngredientPicker
            value={pickerValue}
            category={category}
            subtype={subtype}
            forcedGroup={forcedGroupRefinement}
            hideForcedGroupChip
            initialQuickStartData={initialQuickStartData}
            initialQuickStartAvailability={initialQuickStartAvailability}
            hydrateRecentSelectionsOnInit
            enableQuickStart
            allowCustomOnlyFilter
            autoFocus={autoFocus}
            focusSignal={pickerFocusSignal}
            onValueChange={(nextValue) => {
              setPickerValue(nextValue);
              setLocalError(null);
              setLocalFieldErrors({});
            }}
            onSelect={(item) => {
              setSelected(item);
              onSelectedIngredientChange?.(item);
              setPickerValue(resolveIngredientDisplayNames(item).primaryName);
              setLocalError(null);
              setLocalFieldErrors({});
              setBatchOverrides(buildInitialBatchOverridesFromSelection(item));
              setBatchOverrideMode("catalog");
              const nextUnitProfile = resolveCatalogIngredientUnitProfile(category, item);
              setFields((current) => {
                return {
                  ...current,
                  // Выбор другого ингредиента обнуляет количество — не переносим
                  // предзаполненный дефицит на чужую позицию/единицу (#20-ревью).
                  enteredQuantity: "",
                  enteredUnit: nextUnitProfile.defaultUnit
                };
              });
            }}
            placeholder="Начните вводить название ингредиента"
            emptyCta={({ hasActiveFilters, resetFilters }) => (
              <div className="space-y-3">
                <p className="text-sm text-foreground">
                  Ничего не нашли. Попробуйте сменить категорию
                  {hasActiveFilters ? " или сбросить фильтры" : ""}
                  , либо добавьте свой ингредиент.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="inline-flex items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
                    >
                      Сбросить фильтры
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={onRequestCustom}
                    className="inline-flex items-center rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
                  >
                    Добавить свой ингредиент
                  </button>
                </div>
              </div>
            )}
          />
          {(localError || fieldErrors?.ingredientCatalogItemId) && <p className="text-xs text-destructive">{localError ?? fieldErrors?.ingredientCatalogItemId}</p>}
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
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground">
                    {overrideSummaryState.currentEntries.map((entry) => (
                      <span key={entry.label}>
                        {entry.label}: <span className="font-medium text-foreground">{entry.value}</span>
                      </span>
                    ))}
                    {batchOverrideDefaults.kind !== "water_treatment_acid" ? (
                      <>
                        <span aria-hidden="true" className="text-muted-foreground">•</span>
                        <button
                          type="button"
                          onClick={toggleBatchOverrideEditor}
                          className="inline-flex items-center text-sm font-medium text-foreground underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-foreground"
                        >
                          {batchOverrideMode === "customize" ? "Готово" : "Уточнить параметры"}
                        </button>
                      </>
                    ) : null}
                  </div>

                  {overrideSummaryState.catalogEntries ? (
                    <p className="text-xs text-muted-foreground">
                      В каталоге: {overrideSummaryState.catalogEntries.map((entry) => `${entry.label} ${entry.value}`).join(", ")}
                    </p>
                  ) : null}

                  {batchOverrideMode === "customize" && batchOverrideDefaults.kind === "fermentable" ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="text-sm">Цвет, EBC
                        <NumericInput
                          min={0}
                          step="0.1"
                          className="mt-1 w-full rounded-md border px-2 py-2 text-base sm:text-sm"
                          value={batchOverrides.fermentableColorEbc}
                          onChange={(event) => {
                            setBatchOverrides((current) => ({
                              ...current,
                              fermentableColorEbc: event.target.value
                            }));
                            setLocalFieldErrors((current) => ({ ...current, fermentableColorEbc: null }));
                          }}
                        />
                        {(localFieldErrors.fermentableColorEbc || fieldErrors?.fermentableColorEbc) && <span className="text-xs text-destructive">{localFieldErrors.fermentableColorEbc ?? fieldErrors?.fermentableColorEbc}</span>}
                      </label>

                      <label className="text-sm">Экстрактивность, %
                        <NumericInput
                          min={0}
                          max={100}
                          step="0.1"
                          className="mt-1 w-full rounded-md border px-2 py-2 text-base sm:text-sm"
                          value={batchOverrides.fermentableExtractYieldPct}
                          onChange={(event) => {
                            setBatchOverrides((current) => ({
                              ...current,
                              fermentableExtractYieldPct: event.target.value
                            }));
                            setLocalFieldErrors((current) => ({ ...current, fermentableExtractYieldPct: null }));
                          }}
                        />
                        {(localFieldErrors.fermentableExtractYieldPct || fieldErrors?.fermentableExtractYieldPct) && <span className="text-xs text-destructive">{localFieldErrors.fermentableExtractYieldPct ?? fieldErrors?.fermentableExtractYieldPct}</span>}
                      </label>
                    </div>
                  ) : null}

                  {batchOverrideMode === "customize" && batchOverrideDefaults.kind === "hop" ? (
                    <div className="grid grid-cols-1 gap-3 sm:max-w-xs">
                      <label className="text-sm">Альфа-кислота, %
                        <NumericInput
                          min={0}
                          max={100}
                          step="0.1"
                          className="mt-1 w-full rounded-md border px-2 py-2 text-base sm:text-sm"
                          value={batchOverrides.hopAlphaAcidPct}
                          onChange={(event) => {
                            setBatchOverrides((current) => ({
                              ...current,
                              hopAlphaAcidPct: event.target.value
                            }));
                            setLocalFieldErrors((current) => ({ ...current, hopAlphaAcidPct: null }));
                          }}
                        />
                        {(localFieldErrors.hopAlphaAcidPct || fieldErrors?.hopAlphaAcidPct) && <span className="text-xs text-destructive">{localFieldErrors.hopAlphaAcidPct ?? fieldErrors?.hopAlphaAcidPct}</span>}
                      </label>
                    </div>
                  ) : null}

                  {batchOverrideDefaults.kind === "water_treatment_acid" ? (
                    <div className="grid grid-cols-1 gap-3 sm:max-w-xs">
                      <label className="text-sm">Концентрация кислоты, %
                        <NumericInput
                          min={1}
                          max={100}
                          step="0.1"
                          className="mt-1 w-full rounded-md border px-2 py-2 text-base sm:text-sm"
                          value={batchOverrides.waterTreatmentConcentrationPct}
                          onChange={(event) => {
                            setBatchOverrides((current) => ({
                              ...current,
                              waterTreatmentConcentrationPct: event.target.value
                            }));
                            setLocalFieldErrors((current) => ({ ...current, waterTreatmentConcentrationPct: null }));
                          }}
                        />
                        {(localFieldErrors.waterTreatmentConcentrationPct || fieldErrors?.waterTreatmentConcentrationPct) && <span className="text-xs text-destructive">{localFieldErrors.waterTreatmentConcentrationPct ?? fieldErrors?.waterTreatmentConcentrationPct}</span>}
                      </label>
                    </div>
                  ) : null}

                  {batchOverrideMode === "customize" && derivedVariantPresentation.inlineHelper ? (
                    <p className="text-xs text-muted-foreground">{derivedVariantPresentation.inlineHelper}</p>
                  ) : null}
                </div>
              ) : null}
            />
            {selectedPackEquivalent ? (
              <p className="text-xs text-muted-foreground">
                1 pack = {selectedPackEquivalent.normalizedQuantity} {selectedPackEquivalent.normalizedUnit}
              </p>
            ) : null}
            {derivedVariantPresentation.noticeText ? (
              <p
                className="text-xs text-muted-foreground"
                data-testid="catalog-derived-variant-notice"
              >
                {derivedVariantPresentation.noticeText}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {showRequiredInventoryBlock ? (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4" data-testid="catalog-required-fields">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">Количество *
              <NumericInput
                min={0.0001}
                className="mt-1 w-full rounded-md border px-2 py-2 text-base sm:text-sm"
                value={fields.enteredQuantity}
                onChange={(e) => {
                  setFields((s) => ({ ...s, enteredQuantity: e.target.value }));
                  setLocalFieldErrors((current) => ({ ...current, enteredQuantity: null }));
                }}
              />
              {(localFieldErrors.enteredQuantity || fieldErrors?.enteredQuantity) && <span className="text-xs text-destructive">{localFieldErrors.enteredQuantity ?? fieldErrors?.enteredQuantity}</span>}
            </label>

            <label className="text-sm">Ед. изм. *
              <select
                className="mt-1 w-full rounded-md border px-2 py-2 text-base sm:text-sm"
                value={fields.enteredUnit}
                onChange={(e) => setFields((s) => ({ ...s, enteredUnit: e.target.value as InventoryUnit }))}
              >
                {unitProfile.allowedUnits.map((unit) => <option key={unit} value={unit}>{inventoryUnitLabels[unit]}</option>)}
              </select>
              {fieldErrors?.enteredUnit && <span className="text-xs text-destructive">{fieldErrors.enteredUnit}</span>}
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
                      className="w-full rounded-md border px-2 py-2 text-base sm:text-sm"
                      value={fields.purchasedAt}
                      onChange={(e) => setFields((s) => ({ ...s, purchasedAt: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="rounded-md border border-border px-2 py-2 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-muted"
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
                    className="mt-1 w-full rounded-md border px-2 py-2 text-base sm:text-sm"
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
                  className="mt-1 h-20 w-full rounded-md border px-2 py-2 text-base sm:text-sm"
                  value={fields.notes}
                  onChange={(e) => setFields((s) => ({ ...s, notes: e.target.value }))}
                />
              </label>
            </div>
        </InventoryOptionalDisclosure>
      ) : null}

      {selected ? (
        <button type="submit" disabled={pending} className="w-full rounded-md bg-foreground px-4 py-2.5 text-sm text-background disabled:opacity-60">
          {pending ? "Сохранение..." : derivedVariantPresentation.submitLabel}
        </button>
      ) : null}
    </form>
  );
}
