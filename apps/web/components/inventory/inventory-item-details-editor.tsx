"use client";

import React from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { updateInventoryItemAction, type AddIngredientResult } from "@/app/(app)/app/ingredients/actions";
import { IngredientPicker, IngredientSelectionCard } from "@/components/ingredients/ingredient-picker";
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
import type {
  IngredientCategory,
  IngredientPickerQuickStartResult,
  IngredientPickerQuickStartResultByContext,
  IngredientSubtype,
  IngredientSuggestionItem,
  IngredientType
} from "@/features/ingredients/contracts";
import { resolveIngredientDisplayNames } from "@/features/ingredients/presentation";
import { resolveIngredientCategory, resolveLegacyIngredientType } from "@/features/ingredients/taxonomy";
import type { InventoryListItemDto } from "@/features/inventory/contracts";
import {
  formatInventoryQuantityInputValue,
  resolveInventoryMeasurementForDisplay
} from "@/features/inventory/display";
import { resolveInventoryPackEquivalent } from "@/features/inventory/pack";
import type { InventoryPriceInputMode } from "@/features/inventory/purchase-cost";
import {
  getInventoryUnitInputStep,
  inventoryUnitLabels,
  resolveHumanFacingInventoryUnitProfile,
  type InventoryUnit
} from "@/features/inventory/units";
import { convertCurrencyMinor, formatMoneyInputValueFromMinor } from "@/features/system/money";
import type { SystemCurrency, SystemCurrencyRateMap } from "@/features/system/currency";

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
  familyId: string | null;
  pickerValue: string;
  selectedDisplayName: string;
  ingredientCatalogItemId: string | null;
  userCustomIngredientId: string | null;
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
  source: source.sourceKind === "catalog" ? "catalog" : "custom"
});

const createFormState = (
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

  return {
    type: item.source.type,
    category: item.source.category ?? resolveIngredientCategory({ type: item.source.type }),
    subtype: item.source.subtype ?? null,
    familyId: item.source.familyId ?? null,
    pickerValue: item.source.displayName,
    selectedDisplayName: item.source.displayName,
    ingredientCatalogItemId: item.source.sourceKind === "catalog" ? item.source.sourceId : null,
    userCustomIngredientId: item.source.sourceKind === "custom" ? item.source.sourceId : null,
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
  const [pickerFocusSignal, setPickerFocusSignal] = useState(0);
  const [result, setResult] = useState<AddIngredientResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const backdropPointerDownStartedRef = React.useRef(false);
  const unitProfile = useMemo(
    () => resolveInventoryEditorUnitProfile(form, item.source, selectedSuggestion),
    [form, item.source, selectedSuggestion]
  );
  const quantityStep = getInventoryUnitInputStep(form.enteredUnit);
  const showPickerStage = shouldShowInventoryEditorPickerStage({
    category: form.category,
    selected: selectedSuggestion
  });
  const showRequiredFields = shouldShowInventoryEditorRequiredFields(selectedSuggestion);
  const showOptionalSection = shouldShowInventoryEditorOptionalSection(selectedSuggestion);
  const selectedPackEquivalent = selectedSuggestion
    ? resolveInventoryPackEquivalent(selectedSuggestion.technicalData ?? null)
    : null;
  const selectedContextSummary = selectedSuggestion
    ? resolveInventoryIngredientContextSummaryFromSuggestion(selectedSuggestion, {
      sourceLabelStyle: "short"
    })
    : null;
  const selectionCategoryValue = resolveInventoryIngredientCategoryValue({
    category: form.category,
    subtype: form.subtype
  });
  const pickerSubtype = form.subtype === "malt" || form.subtype === "fermentable"
    ? form.subtype
    : null;
  const initialQuickStartData = resolveInventoryEditorQuickStartData({
    category: form.category,
    subtype: form.subtype,
    initialQuickStartDataByContext
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setForm(createFormState(item, preferredCurrency, currencyRates));
    setSelectedSuggestion(resolveInventoryEditorInitialSelection(item.source, item.enteredUnit));
    setOptionalOpen(false);
    setPurchaseLinksState({
      urls: [],
      isLoaded: false
    });
    setResult(null);
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
    setEditing(false);
  };

  const purchasePriceError = result?.fieldErrors?.priceInputAmountMinor ?? result?.fieldErrors?.purchasePriceMinor ?? result?.fieldErrors?.purchasePrice;

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
      {result && !editing ? <p className={`text-xs ${result.ok ? "text-emerald-700" : "text-red-600"}`}>{result.message}</p> : null}

      {editing ? (() => {
        const modalContent = (
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-zinc-950/55 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-label={`Редактировать ингредиент на складе: ${item.source.displayName}`}
            onPointerDown={(event) => {
              backdropPointerDownStartedRef.current = event.target === event.currentTarget;
            }}
            onClick={(event) => {
              if (backdropPointerDownStartedRef.current && event.target === event.currentTarget) {
                resetForm();
              }

              backdropPointerDownStartedRef.current = false;
            }}
          >
            <div className="relative z-[101] max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-950">Редактировать ингредиент на складе</h2>
                <button type="button" onClick={resetForm} className="text-sm text-zinc-500 transition-colors hover:text-zinc-700">Закрыть</button>
              </div>

              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  startTransition(async () => {
                    const nextResult = await updateInventoryItemAction({
                      inventoryItemId: item.id,
                      ingredientCatalogItemId: form.ingredientCatalogItemId,
                      userCustomIngredientId: form.userCustomIngredientId,
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
                        const { category: nextCategory, subtype: nextSubtype } = resolveInventoryIngredientContextFromCategoryValue(nextCategoryValue);
                        const nextUnitProfile = resolveHumanFacingInventoryUnitProfile({
                          category: nextCategory,
                          subtype: nextSubtype
                        });
                        setSelectedSuggestion(null);
                        setOptionalOpen(false);
                        setForm((current) => ({
                          ...current,
                          type: resolveLegacyIngredientType({ category: nextCategory }),
                          category: nextCategory,
                          subtype: nextSubtype,
                          familyId: null,
                          pickerValue: "",
                          selectedDisplayName: "",
                          ingredientCatalogItemId: null,
                          userCustomIngredientId: null,
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
                    <label className="text-sm font-medium text-zinc-900">Ингредиент</label>
                    <IngredientPicker
                      category={form.category}
                      subtype={pickerSubtype}
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
                        setSelectedSuggestion(selected);
                        setForm((current) => ({
                          ...current,
                          type: selected.type,
                          category: selected.category ?? current.category,
                          subtype: selected.subtype ?? null,
                          familyId: selected.familyId ?? null,
                          pickerValue: displayNames.primaryName,
                          selectedDisplayName: displayNames.primaryName,
                          ingredientCatalogItemId: selected.source === "catalog" ? selected.id : null,
                          userCustomIngredientId: selected.source === "custom" ? selected.id : null,
                          enteredUnit: nextUnitProfile.defaultUnit
                        }));
                        setResult(null);
                      }}
                      placeholder="Начните вводить название ингредиента"
                      emptyCta={<p className="text-xs text-zinc-500">Не нашли подходящую позицию. Уточните запрос или оставьте текущий ингредиент без изменений.</p>}
                    />
                    {(result?.fieldErrors?.ingredientCatalogItemId || result?.fieldErrors?.userCustomIngredientId) ? (
                      <p className="text-xs text-red-600">
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
                        <p className="text-xs text-zinc-500">
                          1 pack = {selectedPackEquivalent.normalizedQuantity} {selectedPackEquivalent.normalizedUnit}
                        </p>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {showRequiredFields ? (
                  <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4" data-testid="inventory-editor-required-fields">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm">Количество *
                        <input
                          type="number"
                          min="0"
                          step={quantityStep}
                          value={form.enteredQuantity}
                          onChange={(event) => {
                            setForm((current) => ({ ...current, enteredQuantity: event.target.value }));
                            setResult(null);
                          }}
                          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                          inputMode="decimal"
                        />
                        {result?.fieldErrors?.enteredQuantity ? <span className="text-xs text-red-600">{result.fieldErrors.enteredQuantity}</span> : null}
                      </label>

                      <label className="text-sm">Ед. изм. *
                        <select
                          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                          value={form.enteredUnit}
                          onChange={(event) => {
                            setForm((current) => ({ ...current, enteredUnit: event.target.value as InventoryUnit }));
                            setResult(null);
                          }}
                        >
                          {unitProfile.allowedUnits.map((unit) => <option key={unit} value={unit}>{inventoryUnitLabels[unit]}</option>)}
                        </select>
                        {result?.fieldErrors?.enteredUnit ? <span className="text-xs text-red-600">{result.fieldErrors.enteredUnit}</span> : null}
                      </label>
                    </div>
                  </section>
                ) : null}

                {showOptionalSection ? (
                  <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4" data-testid="inventory-editor-optional-disclosure">
                    <button
                      type="button"
                      onClick={() => setOptionalOpen((current) => !current)}
                      className="flex w-full items-center justify-between gap-3 text-left"
                      aria-expanded={optionalOpen}
                    >
                      <span className="text-sm font-medium text-zinc-900">Дополнительно</span>
                      <span className="text-sm text-zinc-500">{optionalOpen ? "Скрыть" : "Открыть"}</span>
                    </button>

                    {optionalOpen ? (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-sm">Дата покупки
                            <input
                              type="date"
                              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                              value={form.purchasedAt}
                              onChange={(event) => {
                                setForm((current) => ({ ...current, purchasedAt: event.target.value }));
                                setResult(null);
                              }}
                            />
                          </label>

                          <label className="text-sm">Годен до
                            <input
                              type="date"
                              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
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
                          fieldError={purchasePriceError}
                          onPriceInputModeChange={(mode) => {
                            setForm((current) => ({ ...current, priceInputMode: mode }));
                            setResult(null);
                          }}
                          onPriceInputAmountChange={(value) => {
                            setForm((current) => ({ ...current, priceInputAmount: value }));
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

                        <label className="block text-sm">Заметки
                          <textarea
                            className="mt-1 h-20 w-full rounded-lg border border-zinc-200 px-3 py-2"
                            value={form.notes}
                            onChange={(event) => {
                              setForm((current) => ({ ...current, notes: event.target.value }));
                              setResult(null);
                            }}
                          />
                          {result?.fieldErrors?.notes ? <span className="text-xs text-red-600">{result.fieldErrors.notes}</span> : null}
                        </label>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {result && !result.ok ? <p className="text-xs text-red-600">{result.message}</p> : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={isPending || !canSubmitInventoryForm(form)}
                    className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPending ? "Сохраняем..." : "Сохранить"}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
                  >
                    Отмена
                  </button>
                </div>
              </form>
            </div>
          </div>
        );

        if (typeof window === "undefined") {
          return modalContent;
        }

        if (!mounted) {
          return null;
        }

        return createPortal(modalContent, document.body);
      })() : null}
    </>
  );
}
