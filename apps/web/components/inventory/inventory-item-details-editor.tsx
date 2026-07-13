"use client";

import React from "react";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Button, Dialog, DialogCloseButton, DialogHeader } from "@nb/ui";
import { updateInventoryItemAction, type AddIngredientResult } from "@/app/(app)/app/ingredients/actions";
import { IngredientPicker, IngredientSelectionCard } from "@/components/ingredients/ingredient-picker";
import { NumericInput } from "@/components/shared/numeric-input";
import { IngredientPurchaseLinksField } from "@/components/ingredients/ingredient-purchase-links-field";
import {
  InventoryIngredientCategoryGrid,
  resolveInventoryIngredientCategoryValue,
  resolveInventoryIngredientContextFromCategoryValue
} from "@/components/inventory/inventory-ingredient-category-grid";
import {
  InventoryIngredientContextSummary,
  resolveInventoryIngredientContextSummaryFromSuggestion
} from "@/components/inventory/inventory-ingredient-context-summary";
import { InventoryPriceInput } from "@/components/inventory/inventory-price-input";
import { InventoryItemMovements } from "@/components/inventory/inventory-item-movements";
import type {
  IngredientCategory,
  IngredientConsumableGroupRefinement,
  IngredientPickerQuickStartResult,
  IngredientPickerQuickStartResultByContext,
  IngredientSubtype,
  IngredientSuggestionItem,
  IngredientType
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
import {
  isWaterTreatmentAcidLike,
  readWaterTreatmentConcentrationPct,
} from "@/features/ingredients/water-treatment";
import { resolveIngredientCategory, resolveLegacyIngredientType } from "@/features/ingredients/taxonomy";
import type { InventoryListItemDto } from "@/features/inventory/contracts";
import {
  formatInventoryQuantityInputValue,
  resolveInventoryMeasurementForDisplay
} from "@/features/inventory/display";
import { resolveInventoryPackEquivalent } from "@/features/inventory/pack";
import { inventoryFermentableSubtypeLabels } from "@/features/inventory/page-model";
import type { InventoryPriceInputMode } from "@/features/inventory/purchase-cost";
import {
  getInventoryUnitInputStep,
  inventoryUnitLabels,
  resolveHumanFacingInventoryUnitProfile,
  type InventoryUnit
} from "@/features/inventory/units";
import { convertCurrencyMinor, formatMoneyInputValueFromMinor } from "@/features/system/money";
import type { SystemCurrency, SystemCurrencyRateMap } from "@/features/system/currency";
import { hasValidationErrors, validateNumericInput } from "@/features/forms/numeric-validation";

type Props = {
  item: InventoryListItemDto;
  preferredCurrency: SystemCurrency;
  currencyRates: SystemCurrencyRateMap;
  initialQuickStartDataByContext?: IngredientPickerQuickStartResultByContext | null;
  renderTrigger?: (onClick: () => void) => React.ReactNode;
  initiallyOpen?: boolean;
};

type FormState = {
  type: IngredientType;
  category: IngredientCategory;
  subtype: IngredientSubtype | null;
  group: string | null;
  familyId: string | null;
  pickerValue: string;
  selectedDisplayName: string;
  ingredientCatalogItemId: string | null;
  userCustomIngredientId: string | null;
  waterTreatmentConcentrationPct: string;
  enteredQuantity: string;
  enteredUnit: InventoryUnit;
  priceInputMode: InventoryPriceInputMode;
  priceInputAmount: string;
  purchasedAt: string;
  freshnessDate: string;
  notes: string;
};

const formatDateInput = (value: Date | null) => {
  if (!value) {
    return "";
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatConcentrationInputValue = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) {
    return "";
  }

  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
};

export const resolveInventoryEditorUnitProfile = (
  form: Pick<FormState, "type" | "category" | "subtype" | "enteredUnit">,
  source?: Pick<InventoryListItemDto["source"], "defaultDisplayUnit" | "allowedUnits" | "measurementDimension" | "technicalData"> | null,
  selected?: Pick<IngredientSuggestionItem, "type" | "category" | "subtype" | "defaultDisplayUnit" | "defaultUnit" | "allowedUnits" | "measurementDimension" | "technicalData"> | null
) => resolveHumanFacingInventoryUnitProfile({
  type: selected?.type ?? form.type,
  category: selected?.category ?? form.category,
  subtype: selected?.subtype ?? form.subtype,
  defaultDisplayUnit: selected?.defaultDisplayUnit ?? selected?.defaultUnit ?? source?.defaultDisplayUnit,
  allowedUnits: selected?.allowedUnits ?? source?.allowedUnits,
  measurementDimension: selected?.measurementDimension ?? source?.measurementDimension,
  technicalData: selected?.technicalData ?? source?.technicalData ?? null
});

export const resolveInventoryEditorInitialSelection = (
  source: InventoryListItemDto["source"],
  fallbackUnit: InventoryUnit
): IngredientSuggestionItem => ({
  id: source.sourceId,
  type: source.type,
  category: source.category ?? resolveIngredientCategory({ type: source.type }),
  subtype: source.subtype ?? null,
  familyId: source.familyId ?? null,
  familyDisplayName: source.familyDisplayName ?? null,
  primaryLabelRu: source.primaryLabelRu,
  secondaryLabelRu: source.secondaryLabelRu ?? null,
  displayName: source.displayName,
  displayNameRu: source.displayNameRu ?? source.nameRu ?? source.primaryLabelRu,
  displayNameEn: source.displayNameEn ?? source.nameEn ?? source.secondaryLabelRu ?? null,
  nameRu: source.nameRu ?? source.displayNameRu ?? source.primaryLabelRu,
  nameEn: source.nameEn ?? source.displayNameEn ?? source.secondaryLabelRu ?? null,
  brand: source.brand ?? source.brandName ?? null,
  producer: source.producer ?? source.manufacturer ?? null,
  brandName: source.brandName ?? source.brand ?? null,
  manufacturer: source.manufacturer ?? source.producer ?? null,
  country: source.country ?? source.countryName ?? null,
  countryCode: source.countryCode ?? null,
  countryName: source.countryName ?? source.country ?? null,
  technicalData: source.technicalData ?? null,
  defaultUnit: (source.defaultDisplayUnit ?? fallbackUnit) as IngredientSuggestionItem["defaultUnit"],
  defaultDisplayUnit: (source.defaultDisplayUnit ?? fallbackUnit) as IngredientSuggestionItem["defaultDisplayUnit"],
  allowedUnits: source.allowedUnits as IngredientSuggestionItem["allowedUnits"],
  measurementDimension: source.measurementDimension as IngredientSuggestionItem["measurementDimension"],
  derivedFromIngredientId: source.derivedFromIngredientId ?? null,
  derivedFromDisplayName: source.derivedFromDisplayName ?? null,
  groupName: source.groupName ?? null,
  itemKind: source.itemKind ?? null,
  source: source.sourceKind === "catalog" ? "catalog" : "custom"
});

const resolveInventoryEditorBroadGroup = (
  categoryValue: ReturnType<typeof resolveInventoryIngredientCategoryValue>
) => (
  categoryValue === "consumable_supply"
    ? "inventory_supplies"
    : categoryValue === "consumable_additive"
      ? "inventory_additives"
      : null
);

const fermentableChipValues = [
  "malt",
  ...ingredientPickerFermentableQuickStartGroupOrder
] as const;

const resolveInventoryEditorConsumableBroadGroup = (group?: string | null) => {
  if (!group) {
    return null;
  }

  return isConsumableInventoryBroadGroup(group)
    ? group
    : resolveConsumableInventoryBroadGroup({
      sourceCategory: group
    });
};

export const createFormState = (
  item: InventoryListItemDto,
  preferredCurrency: SystemCurrency,
  currencyRates: SystemCurrencyRateMap
): FormState => {
  const displayMeasurement = resolveInventoryMeasurementForDisplay({
    enteredQuantity: item.enteredQuantity,
    enteredUnit: item.enteredUnit,
    normalizedQuantity: item.normalizedQuantity,
    normalizedUnit: item.normalizedUnit,
    type: item.source.type,
    category: item.source.category,
    subtype: item.source.subtype,
    defaultDisplayUnit: item.source.defaultDisplayUnit,
    allowedUnits: item.source.allowedUnits,
    measurementDimension: item.source.measurementDimension,
    technicalData: item.source.technicalData
  });
  const storedPriceInputCurrency = item.priceInputCurrency ?? item.purchaseCurrency;
  const storedPriceInputAmountMinor = item.priceInputAmountMinor ?? item.purchasePriceMinor;
  const displayPriceMinor = storedPriceInputAmountMinor != null && storedPriceInputCurrency
    ? convertCurrencyMinor(storedPriceInputAmountMinor, storedPriceInputCurrency, preferredCurrency, currencyRates)
    : storedPriceInputAmountMinor;
  const categoryValue = resolveInventoryIngredientCategoryValue({
    category: item.source.category ?? resolveIngredientCategory({ type: item.source.type }),
    subtype: item.source.subtype ?? null,
    technicalData: item.source.technicalData ?? null,
    groupName: item.source.groupName ?? null,
    itemKind: item.source.itemKind ?? null
  });
  const group = resolveInventoryEditorBroadGroup(categoryValue);

  return {
    type: item.source.type,
    category: item.source.category ?? resolveIngredientCategory({ type: item.source.type }),
    subtype: item.source.subtype ?? null,
    group,
    familyId: item.source.familyId ?? null,
    pickerValue: item.source.displayName,
    selectedDisplayName: item.source.displayName,
    ingredientCatalogItemId: item.source.sourceKind === "catalog" ? item.source.sourceId : null,
    userCustomIngredientId: item.source.sourceKind === "custom" ? item.source.sourceId : null,
    waterTreatmentConcentrationPct: formatConcentrationInputValue(readWaterTreatmentConcentrationPct(item.source.technicalData)),
    enteredQuantity: formatInventoryQuantityInputValue(displayMeasurement.quantity, displayMeasurement.unit),
    enteredUnit: displayMeasurement.unit,
    priceInputMode: item.priceInputMode ?? (displayPriceMinor != null ? "total" : "total"),
    priceInputAmount: formatMoneyInputValueFromMinor(displayPriceMinor),
    purchasedAt: formatDateInput(item.purchasedAt),
    freshnessDate: formatDateInput(item.freshnessDate),
    notes: item.notes ?? ""
  };
};

const canSubmitInventoryForm = (form: FormState) => {
  if (!form.ingredientCatalogItemId && !form.userCustomIngredientId) {
    return false;
  }

  const quantity = Number(form.enteredQuantity);
  return Number.isFinite(quantity) && quantity > 0;
};

const validateInventoryEditorNumbers = ({
  form,
  showWaterTreatmentConcentrationField
}: {
  form: FormState;
  showWaterTreatmentConcentrationField: boolean;
}) => {
  const errors: Record<string, string | null> = {
    enteredQuantity: validateNumericInput(form.enteredQuantity, {
      label: "Количество",
      required: true,
      min: 0,
      exclusiveMin: true
    }),
    priceInputAmount: validateNumericInput(form.priceInputAmount, {
      label: "Цена",
      min: 0,
      exclusiveMin: true
    })
  };

  if (showWaterTreatmentConcentrationField) {
    errors.waterTreatmentConcentrationPct = validateNumericInput(form.waterTreatmentConcentrationPct, {
      label: "Концентрация кислоты",
      min: 0,
      max: 100,
      exclusiveMin: true
    });
  }

  return errors;
};

export const shouldShowInventoryEditorPickerStage = ({
  category,
  selected
}: {
  category?: IngredientCategory;
  selected: IngredientSuggestionItem | null;
}) => Boolean(category) && !selected;

export const shouldShowInventoryEditorRequiredFields = (
  selected: IngredientSuggestionItem | null
) => Boolean(selected);

export const shouldShowInventoryEditorOptionalSection = (
  selected: IngredientSuggestionItem | null
) => Boolean(selected);

export const isWaterTreatmentAcidSuggestion = (
  selected: IngredientSuggestionItem | null
): selected is IngredientSuggestionItem => (
  Boolean(selected && isWaterTreatmentAcidLike(selected))
);

export const resolveInventoryEditorSelectionResetState = () => ({
  pickerValue: "",
  shouldRefocus: true
});

export const resolveInventoryEditorSelectionResetTaxonomy = ({
  category,
  subtype
}: {
  category: IngredientCategory;
  subtype: IngredientSubtype | null;
}) => {
  const nextSubtype = category === "fermentable" && (subtype === "malt" || subtype === "fermentable")
    ? subtype
    : null;

  return {
    type: resolveLegacyIngredientType({ category, subtype: nextSubtype }),
    subtype: nextSubtype
  };
};

export const resolveInventoryEditorQuickStartData = ({
  category,
  subtype,
  initialQuickStartDataByContext
}: {
  category?: IngredientCategory | null;
  subtype?: IngredientSubtype | null;
  initialQuickStartDataByContext?: IngredientPickerQuickStartResultByContext | null;
}): IngredientPickerQuickStartResult | null => {
  if (!initialQuickStartDataByContext) {
    return null;
  }

  if (category === "hop") {
    return initialQuickStartDataByContext.hop ?? null;
  }

  if (category === "yeast") {
    return initialQuickStartDataByContext.yeast ?? null;
  }

  if (category === "water_treatment") {
    return initialQuickStartDataByContext.water_treatment ?? null;
  }

  if (category === "consumable") {
    return initialQuickStartDataByContext.consumable ?? null;
  }

  if (category === "fermentable" && (subtype === "malt" || subtype === "fermentable")) {
    return initialQuickStartDataByContext[subtype] ?? null;
  }

  return null;
};

export function InventoryItemDetailsEditor({
  item,
  preferredCurrency,
  currencyRates,
  initialQuickStartDataByContext = null,
  renderTrigger,
  initiallyOpen = false
}: Props) {
  const [editing, setEditing] = useState(initiallyOpen);
  const [form, setForm] = useState<FormState>(() => createFormState(item, preferredCurrency, currencyRates));
  const [selectedSuggestion, setSelectedSuggestion] = useState<IngredientSuggestionItem | null>(() => (
    resolveInventoryEditorInitialSelection(item.source, item.enteredUnit)
  ));
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [purchaseLinksState, setPurchaseLinksState] = useState<{ urls: string[]; isLoaded: boolean }>({
    urls: [],
    isLoaded: false
  });
  const [localFieldErrors, setLocalFieldErrors] = useState<Record<string, string | null>>({});
  const [pickerFocusSignal, setPickerFocusSignal] = useState(0);
  const [result, setResult] = useState<AddIngredientResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const unitProfile = useMemo(
    () => resolveInventoryEditorUnitProfile(form, item.source, selectedSuggestion),
    [form, item.source, selectedSuggestion]
  );
  const quantityStep = getInventoryUnitInputStep(form.enteredUnit);
  const selectedPackEquivalent = useMemo(
    () => selectedSuggestion
      ? resolveInventoryPackEquivalent(selectedSuggestion.technicalData ?? null)
      : null,
    [selectedSuggestion]
  );
  const getUnitLabel = (unit: InventoryUnit) => {
    if (unit !== "pack" || !selectedPackEquivalent) {
      return inventoryUnitLabels[unit];
    }

    return `пачка ${formatInventoryQuantityInputValue(selectedPackEquivalent.normalizedQuantity, selectedPackEquivalent.normalizedUnit)}${selectedPackEquivalent.normalizedUnit}`;
  };
  const showPickerStage = shouldShowInventoryEditorPickerStage({
    category: form.category,
    selected: selectedSuggestion
  });
  const showRequiredFields = shouldShowInventoryEditorRequiredFields(selectedSuggestion);
  const showOptionalSection = shouldShowInventoryEditorOptionalSection(selectedSuggestion);
  const selectedContextSummary = selectedSuggestion
    ? resolveInventoryIngredientContextSummaryFromSuggestion(selectedSuggestion, {
      sourceLabelStyle: "short"
    })
    : null;
  const showWaterTreatmentConcentrationField = isWaterTreatmentAcidSuggestion(selectedSuggestion);
  const selectionCategoryValue = resolveInventoryIngredientCategoryValue({
    category: form.category,
    subtype: form.subtype,
    group: form.group
  });
  const pickerSubtype = form.subtype === "malt" || form.subtype === "fermentable"
    ? form.subtype
    : null;
  const activeConsumableBroadGroup = form.category === "consumable"
    ? resolveInventoryEditorConsumableBroadGroup(form.group)
    : null;
  const forcedGroupRefinement: IngredientConsumableGroupRefinement | null = form.group
    ? {
      type: "consumable_group",
      label: activeConsumableBroadGroup && isConsumableInventoryBroadGroup(form.group)
        ? (resolveConsumableInventoryBroadGroupLabel(form.group) ?? form.group)
        : resolveConsumablePickerGroupLabel(form.group) ?? resolveConsumableInventoryBroadGroupLabel(form.group) ?? form.group,
      normalizedLabel: form.group,
      value: form.group,
      count: 0,
      score: 0
    }
    : null;
  const initialQuickStartData = resolveInventoryEditorQuickStartData({
    category: form.category,
    subtype: form.subtype,
    initialQuickStartDataByContext
  });
  const currentNumberErrors = validateInventoryEditorNumbers({
    form,
    showWaterTreatmentConcentrationField
  });
  const hasCurrentNumberErrors = hasValidationErrors(currentNumberErrors);

  useEffect(() => {
    setForm(createFormState(item, preferredCurrency, currencyRates));
    setSelectedSuggestion(resolveInventoryEditorInitialSelection(item.source, item.enteredUnit));
    setOptionalOpen(false);
    setPurchaseLinksState({
      urls: [],
      isLoaded: false
    });
    setResult(null);
    setLocalFieldErrors({});
    setEditing(initiallyOpen);
  }, [currencyRates, initiallyOpen, item, preferredCurrency]);

  useEffect(() => {
    const hasOptionalErrors = Boolean(
      result?.fieldErrors?.priceInputAmountMinor
      || result?.fieldErrors?.purchasePriceMinor
      || result?.fieldErrors?.purchasePrice
      || result?.fieldErrors?.purchasedAt
      || result?.fieldErrors?.freshnessDate
      || result?.fieldErrors?.notes
    );

    if (hasOptionalErrors) {
      setOptionalOpen(true);
    }
  }, [result]);

  const resetForm = () => {
    setForm(createFormState(item, preferredCurrency, currencyRates));
    setSelectedSuggestion(resolveInventoryEditorInitialSelection(item.source, item.enteredUnit));
    setOptionalOpen(false);
    setPurchaseLinksState({
      urls: [],
      isLoaded: false
    });
    setResult(null);
    setLocalFieldErrors({});
    setEditing(false);
  };

  const purchasePriceError = result?.fieldErrors?.priceInputAmountMinor ?? result?.fieldErrors?.purchasePriceMinor ?? result?.fieldErrors?.purchasePrice;

  const buildSubmitSourcePayload = () => {
    return {
      ingredientCatalogItemId: form.ingredientCatalogItemId,
      userCustomIngredientId: form.userCustomIngredientId,
      waterTreatmentConcentrationPct: showWaterTreatmentConcentrationField
        ? form.waterTreatmentConcentrationPct
        : null,
    };
  };

  const openEditor = () => {
    setForm(createFormState(item, preferredCurrency, currencyRates));
    setSelectedSuggestion(resolveInventoryEditorInitialSelection(item.source, item.enteredUnit));
    setOptionalOpen(false);
    setPurchaseLinksState({
      urls: [],
      isLoaded: false
    });
    setResult(null);
    setEditing(true);
  };

  const clearSelectedIngredient = () => {
    const resetState = resolveInventoryEditorSelectionResetState();
    const resetUnitProfile = resolveHumanFacingInventoryUnitProfile({
      category: form.category,
      subtype: form.subtype
    });

    setSelectedSuggestion(null);
    setOptionalOpen(false);
    setPurchaseLinksState({
      urls: [],
      isLoaded: false
    });
    setForm((current) => ({
      ...current,
      ...resolveInventoryEditorSelectionResetTaxonomy({
        category: current.category,
        subtype: current.subtype
      }),
      familyId: null,
      pickerValue: resetState.pickerValue,
      selectedDisplayName: "",
      ingredientCatalogItemId: null,
      userCustomIngredientId: null,
      waterTreatmentConcentrationPct: "",
      enteredUnit: resetUnitProfile.defaultUnit
    }));
    setResult(null);

    if (resetState.shouldRefocus) {
      setPickerFocusSignal((current) => current + 1);
    }
  };

  return (
    <>
      {renderTrigger
        ? renderTrigger(openEditor)
        : (
          <button type="button" onClick={openEditor} className="rounded border px-2 py-1 text-xs">
            Редактировать карточку
          </button>
        )}
      {result && !editing ? (
        <p role={result.ok ? "status" : "alert"} className={`text-xs ${result.ok ? "text-success" : "text-destructive"}`}>
          {result.message}
        </p>
      ) : null}

      <Dialog
        open={editing}
        onOpenChange={(next) => {
          if (!next) resetForm();
        }}
        title={`Редактировать ингредиент на складе: ${item.source.displayName}`}
        hideTitle
        size="lg"
      >
        <DialogHeader>
          <h2 className="text-base font-semibold text-foreground">Редактировать ингредиент</h2>
          <DialogCloseButton />
        </DialogHeader>

        <div className="p-5">

              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  startTransition(async () => {
                    const sourcePayload = buildSubmitSourcePayload();
                    const nextFieldErrors = validateInventoryEditorNumbers({
                      form,
                      showWaterTreatmentConcentrationField
                    });
                    setLocalFieldErrors(nextFieldErrors);
                    if (hasValidationErrors(nextFieldErrors)) {
                      return;
                    }
                    const nextResult = await updateInventoryItemAction({
                      inventoryItemId: item.id,
                      ingredientCatalogItemId: sourcePayload.ingredientCatalogItemId,
                      userCustomIngredientId: sourcePayload.userCustomIngredientId,
                      waterTreatmentConcentrationPct: sourcePayload.waterTreatmentConcentrationPct,
                      enteredQuantity: form.enteredQuantity,
                      enteredUnit: form.enteredUnit,
                      priceInputMode: form.priceInputMode,
                      priceInputAmount: form.priceInputAmount,
                      purchasedAt: form.purchasedAt,
                      freshnessDate: form.freshnessDate,
                      notes: form.notes,
                      purchaseLinks: purchaseLinksState.urls,
                      purchaseLinksTouched: purchaseLinksState.isLoaded
                    });

                    setResult(nextResult);
                    if (nextResult.ok) {
                      setEditing(false);
                    }
                  });
                }}
              >
                {!selectedSuggestion ? (
                  <div data-testid="inventory-editor-selection-controls">
                    <InventoryIngredientCategoryGrid
                      value={selectionCategoryValue}
                      onChange={(nextCategoryValue) => {
                        const {
                          category: nextCategory,
                          subtype: nextSubtype,
                          group: nextGroup
                        } = resolveInventoryIngredientContextFromCategoryValue(nextCategoryValue);
                        const nextUnitProfile = resolveHumanFacingInventoryUnitProfile({
                          category: nextCategory,
                          subtype: nextSubtype
                        });
                        setSelectedSuggestion(null);
                        setOptionalOpen(false);
                        setForm((current) => ({
                          ...current,
                          type: resolveLegacyIngredientType({ category: nextCategory, subtype: nextSubtype }),
                          category: nextCategory,
                          subtype: nextSubtype,
                          group: nextGroup,
                          familyId: null,
                          pickerValue: "",
                          selectedDisplayName: "",
                          ingredientCatalogItemId: null,
                          userCustomIngredientId: null,
                          waterTreatmentConcentrationPct: "",
                          enteredUnit: nextUnitProfile.defaultUnit
                        }));
                        setResult(null);
                        setPickerFocusSignal((current) => current + 1);
                      }}
                    />
                  </div>
                ) : null}

                {showPickerStage ? (
                  <section className="space-y-2" data-testid="inventory-editor-picker-stage">
                    {form.category === "fermentable" ? (
                      <div className="flex flex-wrap gap-2" data-testid="inventory-editor-fermentable-subtype-switch">
                        {fermentableChipValues.map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => {
                              const nextUnitProfile = resolveHumanFacingInventoryUnitProfile({
                                category: "fermentable",
                                subtype: value === "malt" ? "malt" : "fermentable"
                              });
                              setForm((current) => ({
                                ...current,
                                type: resolveLegacyIngredientType({
                                  category: "fermentable",
                                  subtype: value === "malt" ? "malt" : "fermentable"
                                }),
                                subtype: value === "malt" ? "malt" : "fermentable",
                                group: value === "malt" ? null : value,
                                enteredUnit: nextUnitProfile.defaultUnit
                              }));
                              setResult(null);
                              setPickerFocusSignal((current) => current + 1);
                            }}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              (value === "malt" && pickerSubtype === "malt" && !form.group)
                              || (value !== "malt" && pickerSubtype === "fermentable" && form.group === value)
                                ? "border-warning/30 bg-warning-subtle text-warning-subtle-foreground"
                                : "border-border bg-card text-muted-foreground hover:border-border hover:bg-muted"
                            }`}
                          >
                            {value === "malt" ? inventoryFermentableSubtypeLabels.malt : resolveFermentableQuickStartGroupLabel(value)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {form.category === "consumable" && activeConsumableBroadGroup ? (
                      <div className="flex flex-wrap gap-2" data-testid="inventory-editor-consumable-group-switch">
                        {(activeConsumableBroadGroup === "inventory_supplies"
                          ? consumableInventorySupplyGroups
                          : consumableInventoryAdditiveGroups
                        ).map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => {
                              setForm((current) => ({
                                ...current,
                                group: current.group === value ? activeConsumableBroadGroup : value
                              }));
                              setResult(null);
                              setPickerFocusSignal((current) => current + 1);
                            }}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              form.group === value
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
                      category={form.category}
                      subtype={pickerSubtype}
                      forcedGroup={forcedGroupRefinement}
                      hideForcedGroupChip
                      value={form.pickerValue}
                      initialQuickStartData={initialQuickStartData}
                      enableQuickStart
                      autoFocus
                      focusSignal={pickerFocusSignal}
                      onValueChange={(nextValue) => {
                        setForm((current) => ({
                          ...current,
                          pickerValue: nextValue
                        }));
                        setResult(null);
                      }}
                      onSelect={(selected) => {
                        const nextUnitProfile = resolveInventoryEditorUnitProfile(form, item.source, selected);
                        const displayNames = resolveIngredientDisplayNames(selected);
                        const nextCategory = selected.category ?? form.category;
                        const nextSubtype = selected.subtype ?? null;
                        const nextGroup = resolveInventoryEditorBroadGroup(resolveInventoryIngredientCategoryValue({
                          category: nextCategory,
                          subtype: nextSubtype,
                          technicalData: selected.technicalData ?? null,
                          groupName: selected.groupName ?? null,
                          itemKind: selected.itemKind ?? null
                        }));
                        setSelectedSuggestion(selected);
                        setForm((current) => ({
                          ...current,
                          type: selected.type,
                          category: nextCategory,
                          subtype: nextSubtype,
                          group: nextGroup,
                          familyId: selected.familyId ?? null,
                          pickerValue: displayNames.primaryName,
                          selectedDisplayName: displayNames.primaryName,
                          ingredientCatalogItemId: selected.source === "catalog" ? selected.id : null,
                          userCustomIngredientId: selected.source === "custom" ? selected.id : null,
                          waterTreatmentConcentrationPct: formatConcentrationInputValue(
                            readWaterTreatmentConcentrationPct(selected.technicalData)
                          ),
                          enteredUnit: nextUnitProfile.defaultUnit
                        }));
                        setResult(null);
                      }}
                      placeholder="Начните вводить название ингредиента"
                      emptyCta={<p className="text-xs text-muted-foreground">Не нашли подходящую позицию. Уточните запрос или оставьте текущий ингредиент без изменений.</p>}
                    />
                    {(result?.fieldErrors?.ingredientCatalogItemId || result?.fieldErrors?.userCustomIngredientId) ? (
                      <p className="text-xs text-destructive">
                        {result.fieldErrors?.ingredientCatalogItemId ?? result.fieldErrors?.userCustomIngredientId}
                      </p>
                    ) : null}
                  </section>
                ) : null}

                {selectedSuggestion ? (
                  <section className="space-y-3" data-testid="inventory-editor-selection-stage">
                    {selectedContextSummary ? (
                      <InventoryIngredientContextSummary
                        summary={selectedContextSummary}
                        testId="inventory-editor-context-summary"
                      />
                    ) : null}
                    <div className="space-y-2">
                      <IngredientSelectionCard
                        item={selectedSuggestion}
                        actionLabel="Заменить ингредиент"
                        onAction={clearSelectedIngredient}
                        hideTypedSummary
                        hideSubtitle
                        mergeBrandAndCountry
                      />
                        {selectedPackEquivalent ? (
                          <p className="text-xs text-muted-foreground">
                            1 pack = {selectedPackEquivalent.normalizedQuantity} {selectedPackEquivalent.normalizedUnit}
                          </p>
                        ) : null}
                    </div>
                  </section>
                ) : null}

                {showRequiredFields ? (
                  <section className="space-y-3 rounded-xl border border-border bg-muted/50 p-4" data-testid="inventory-editor-required-fields">
                    {showWaterTreatmentConcentrationField ? (
                      <label className="block text-sm font-medium text-foreground">Концентрация кислоты, %
                        <NumericInput
                          min={1}
                          max={100}
                          step="0.1"
                          value={form.waterTreatmentConcentrationPct}
                          onChange={(event) => {
                            setForm((current) => ({ ...current, waterTreatmentConcentrationPct: event.target.value }));
                            setLocalFieldErrors((current) => ({ ...current, waterTreatmentConcentrationPct: null }));
                            setResult(null);
                          }}
                          className="mt-1.5 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-base transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring sm:max-w-xs sm:text-sm"
                          placeholder="Например: 80"
                        />
                        {(localFieldErrors.waterTreatmentConcentrationPct || currentNumberErrors.waterTreatmentConcentrationPct || result?.fieldErrors?.waterTreatmentConcentrationPct) ? <span className="mt-1 block text-xs text-destructive">{localFieldErrors.waterTreatmentConcentrationPct ?? currentNumberErrors.waterTreatmentConcentrationPct ?? result?.fieldErrors?.waterTreatmentConcentrationPct}</span> : null}
                      </label>
                    ) : null}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm font-medium text-foreground">Количество *
                        <NumericInput
                          min={quantityStep}
                          step={quantityStep}
                          value={form.enteredQuantity}
                          onChange={(event) => {
                            setForm((current) => ({ ...current, enteredQuantity: event.target.value }));
                            setLocalFieldErrors((current) => ({ ...current, enteredQuantity: null }));
                            setResult(null);
                          }}
                          className="mt-1.5 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-base transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
                        />
                        {(localFieldErrors.enteredQuantity || currentNumberErrors.enteredQuantity || result?.fieldErrors?.enteredQuantity) ? <span className="mt-1 block text-xs text-destructive">{localFieldErrors.enteredQuantity ?? currentNumberErrors.enteredQuantity ?? result?.fieldErrors?.enteredQuantity}</span> : null}
                      </label>

                      <label className="block text-sm font-medium text-foreground">Ед. изм. *
                        <select
                          className="mt-1.5 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-base transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
                          value={form.enteredUnit}
                          onChange={(event) => {
                            setForm((current) => ({ ...current, enteredUnit: event.target.value as InventoryUnit }));
                            setResult(null);
                          }}
                        >
                          {unitProfile.allowedUnits.map((unit) => <option key={unit} value={unit}>{getUnitLabel(unit)}</option>)}
                        </select>
                        {result?.fieldErrors?.enteredUnit ? <span className="mt-1 block text-xs text-destructive">{result.fieldErrors.enteredUnit}</span> : null}
                      </label>
                    </div>
                  </section>
                ) : null}

                {showOptionalSection ? (
                  <section className="space-y-3 rounded-xl border border-border bg-muted/50 p-4" data-testid="inventory-editor-optional-disclosure">
                    <button
                      type="button"
                      onClick={() => setOptionalOpen((current) => !current)}
                      className="flex w-full items-center justify-between gap-3 text-left"
                      aria-expanded={optionalOpen}
                    >
                      <span className="text-sm font-medium text-foreground">Дополнительно</span>
                      <span className="text-xs font-medium text-muted-foreground">{optionalOpen ? "Скрыть" : "Показать"}</span>
                    </button>

                    {optionalOpen ? (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-sm font-medium text-foreground">Дата покупки
                            <input
                              type="date"
                              className="mt-1.5 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-base transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
                              value={form.purchasedAt}
                              onChange={(event) => {
                                setForm((current) => ({ ...current, purchasedAt: event.target.value }));
                                setResult(null);
                              }}
                            />
                          </label>

                          <label className="block text-sm font-medium text-foreground">Годен до
                            <input
                              type="date"
                              className="mt-1.5 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-base transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
                              value={form.freshnessDate}
                              onChange={(event) => {
                                setForm((current) => ({ ...current, freshnessDate: event.target.value }));
                                setResult(null);
                              }}
                            />
                          </label>
                        </div>

                        <InventoryPriceInput
                          preferredCurrency={preferredCurrency}
                          priceInputMode={form.priceInputMode}
                          priceInputAmount={form.priceInputAmount}
                          enteredQuantity={form.enteredQuantity}
                          enteredUnit={form.enteredUnit}
                          fieldError={localFieldErrors.priceInputAmount ?? currentNumberErrors.priceInputAmount ?? purchasePriceError}
                          onPriceInputModeChange={(mode) => {
                            setForm((current) => ({ ...current, priceInputMode: mode }));
                            setResult(null);
                          }}
                          onPriceInputAmountChange={(value) => {
                            setForm((current) => ({ ...current, priceInputAmount: value }));
                            setLocalFieldErrors((current) => ({ ...current, priceInputAmount: null }));
                            setResult(null);
                          }}
                          type={selectedSuggestion?.type ?? form.type}
                          category={selectedSuggestion?.category ?? form.category}
                          subtype={selectedSuggestion?.subtype ?? form.subtype}
                          defaultDisplayUnit={selectedSuggestion?.defaultDisplayUnit ?? selectedSuggestion?.defaultUnit ?? item.source.defaultDisplayUnit}
                          allowedUnits={selectedSuggestion?.allowedUnits ?? item.source.allowedUnits}
                          measurementDimension={selectedSuggestion?.measurementDimension ?? item.source.measurementDimension}
                          technicalData={selectedSuggestion?.technicalData ?? item.source.technicalData}
                        />

                        <IngredientPurchaseLinksField
                          reference={selectedSuggestion ? {
                            source: selectedSuggestion.source,
                            id: selectedSuggestion.id
                          } : null}
                          enabled={optionalOpen}
                          onStateChange={setPurchaseLinksState}
                          testId="inventory-editor-purchase-links-field"
                        />

                        <label className="block text-sm font-medium text-foreground">Заметки
                          <textarea
                            className="mt-1.5 h-20 w-full resize-none rounded-xl border border-border bg-card px-3.5 py-2.5 text-base transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
                            value={form.notes}
                            onChange={(event) => {
                              setForm((current) => ({ ...current, notes: event.target.value }));
                              setResult(null);
                            }}
                          />
                          {result?.fieldErrors?.notes ? <span className="mt-1 block text-xs text-destructive">{result.fieldErrors.notes}</span> : null}
                        </label>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {result && !result.ok ? <p role="alert" className="text-xs text-destructive">{result.message}</p> : null}

                <div className="flex gap-3 pt-2">
                  <Button
                    type="submit"
                    size="md"
                    className="flex-1 sm:flex-initial"
                    disabled={isPending || !canSubmitInventoryForm(form) || hasCurrentNumberErrors}
                  >
                    {isPending ? "Сохраняем..." : "Сохранить"}
                  </Button>
                  <Button type="button" variant="outline" size="md" onClick={resetForm}>
                    Отмена
                  </Button>
                </div>
              </form>

              {/* Журнал движений по позиции (UX-находка #19) — под формой, тянется
                  клиентом при открытии деталей. */}
              <InventoryItemMovements inventoryItemId={item.id} open={editing} />
        </div>
      </Dialog>
    </>
  );
}
