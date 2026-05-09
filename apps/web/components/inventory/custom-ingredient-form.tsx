"use client";

import React from "react";
import { useEffect, useMemo, useState } from "react";

import { IngredientPurchaseLinksField } from "@/components/ingredients/ingredient-purchase-links-field";
import { InventoryPriceInput } from "@/components/inventory/inventory-price-input";
import {
  createInitialInventoryOptionalFields,
  InventoryOptionalDisclosure
} from "@/components/inventory/inventory-optional-disclosure";
import type { IngredientCategory, IngredientSubtype } from "@/features/ingredients/contracts";
import { formatIngredientSubtypeLabel } from "@/features/ingredients/presentation";
import { ingredientCategorySubtypes, resolveIngredientSubtype, resolveLegacyIngredientType } from "@/features/ingredients/taxonomy";
import {
  buildCustomIngredientTechnicalData,
  customHopFormLabels,
  customHopSelectableForms,
  customYeastFormLabels,
  customYeastForms,
  normalizeCustomIngredientSubtype,
  resolveCustomIngredientUnitProfile,
  resolveDefaultCustomIngredientSubtype,
  shouldShowCustomIngredientSubtypeField,
  type CustomHopForm,
  type CustomYeastForm
} from "@/features/inventory/custom-ingredient";
import type { InventoryPriceInputMode } from "@/features/inventory/purchase-cost";
import {
  inventoryUnitLabels,
  type InventoryUnit
} from "@/features/inventory/units";
import type { SystemCurrency } from "@/features/system/currency";

export type CustomIngredientSubmitPayload = {
  type: string;
  category: IngredientCategory;
  subtype: string;
  displayName: string;
  brand: string;
  country: string;
  harvestYear: string;
  fermentableColorEbc: string;
  fermentableExtractYieldPct: string;
  hopAlphaAcidPct: string;
  hopForm: string;
  yeastAttenuationPct: string;
  yeastForm: string;
  defaultDisplayUnit: InventoryUnit;
  enteredQuantity: string;
  enteredUnit: InventoryUnit;
  priceInputMode?: InventoryPriceInputMode;
  priceInputAmount?: string;
  purchasedAt?: string;
  freshnessDate?: string;
  notes?: string;
  purchaseLinks?: string[];
  purchaseLinksTouched?: boolean;
};

type Props = {
  category: IngredientCategory;
  initialSubtype?: IngredientSubtype | null;
  subtypeOptions?: readonly IngredientSubtype[];
  initialDisplayName?: string;
  preferredCurrency?: SystemCurrency;
  pending: boolean;
  mode?: "inventory" | "recipe";
  submitLabel?: string;
  fieldErrors?: Record<string, string>;
  onDisplayNameChange?: (value: string) => void;
  onSubmit: (payload: CustomIngredientSubmitPayload) => Promise<void>;
};

const parseOptionalNumber = (value: string) => {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveSubtypeFieldLabel = () => "Подтип";

type CustomIngredientPlaceholderKind =
  | "malt"
  | "fermentable"
  | "hop"
  | "yeast"
  | "water_treatment"
  | "consumable";

const resolveCustomIngredientPlaceholderKind = (
  category: IngredientCategory,
  subtype: IngredientSubtype | null
): CustomIngredientPlaceholderKind => {
  if (category === "fermentable") {
    return subtype === "fermentable" ? "fermentable" : "malt";
  }

  return category;
};

const resolveCustomIngredientDisplayNamePlaceholder = (kind: CustomIngredientPlaceholderKind) => {
  if (kind === "malt") {
    return "Например: Пшеничный солод";
  }

  if (kind === "fermentable") {
    return "Например: Декстроза";
  }

  if (kind === "hop") {
    return "Например: Хмель Cascade";
  }

  if (kind === "yeast") {
    return "Например: US-05";
  }

  if (kind === "water_treatment") {
    return "Например: Молочная кислота 80%";
  }

  return "Например: Irish Moss";
};

const resolveCustomIngredientBrandPlaceholder = (kind: CustomIngredientPlaceholderKind) => {
  if (kind === "malt") {
    return "Например: Castle Malting";
  }

  if (kind === "fermentable") {
    return "Например: Briess";
  }

  if (kind === "hop") {
    return "Например: Yakima Chief Hops";
  }

  if (kind === "yeast") {
    return "Например: Fermentis";
  }

  if (kind === "water_treatment") {
    return "Например: Неохим";
  }

  return "Например: Five Star Chemicals";
};

const customIngredientCountryOptions = [
  "Россия",
  "Беларусь",
  "Украина",
  "Казахстан",
  "Германия",
  "Бельгия",
  "Чехия",
  "Великобритания",
  "США",
  "Канада",
  "Франция",
  "Нидерланды",
  "Австрия",
  "Польша",
  "Финляндия",
  "Дания",
  "Словакия",
  "Словения",
  "Австралия",
  "Новая Зеландия",
  "Китай",
  "Индия",
  "ЮАР",
  "Аргентина",
  "Бразилия"
] as const;

function FieldBadge({ required }: { required: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none ${
      required
        ? "bg-amber-50 text-amber-600 ring-1 ring-amber-100"
        : "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200/70"
    }`}>
      {required ? "обязательно" : "необязательно"}
    </span>
  );
}

export const getCustomIngredientSubtypeOptions = (category: IngredientCategory) => ingredientCategorySubtypes[category];

export function CustomIngredientForm({
  category,
  initialSubtype = null,
  subtypeOptions: customSubtypeOptions,
  initialDisplayName = "",
  preferredCurrency = "RUB",
  pending,
  mode = "inventory",
  submitLabel,
  fieldErrors,
  onDisplayNameChange,
  onSubmit
}: Props) {
  const initialOptionalFields = createInitialInventoryOptionalFields();
  const baseSubtypeOptions: readonly IngredientSubtype[] = !shouldShowCustomIngredientSubtypeField(category)
    ? []
    : getCustomIngredientSubtypeOptions(category) as readonly IngredientSubtype[];
  const subtypeOptions: readonly IngredientSubtype[] = customSubtypeOptions?.length
    ? baseSubtypeOptions.filter((option) => customSubtypeOptions.includes(option))
    : baseSubtypeOptions;
  const subtypeOptionsKey = subtypeOptions.join("|");
  const resolveInitialSubtypeValue = () => {
    const requestedSubtype = initialSubtype ?? resolveDefaultCustomIngredientSubtype(category) ?? "";
    if (subtypeOptions.includes(requestedSubtype as IngredientSubtype)) {
      return requestedSubtype;
    }

    return subtypeOptions[0] ?? "";
  };
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [brand, setBrand] = useState("");
  const [country, setCountry] = useState("");
  const [subtype, setSubtype] = useState<string>(() => resolveInitialSubtypeValue());
  const [fermentableColorEbc, setFermentableColorEbc] = useState("");
  const [fermentableExtractYieldPct, setFermentableExtractYieldPct] = useState("");
  const [hopAlphaAcidPct, setHopAlphaAcidPct] = useState("");
  const [hopForm, setHopForm] = useState<CustomHopForm>("pellet");
  const [harvestYear, setHarvestYear] = useState("");
  const [yeastAttenuationPct, setYeastAttenuationPct] = useState("");
  const [yeastForm, setYeastForm] = useState<CustomYeastForm>("dry");
  const [enteredQuantity, setEnteredQuantity] = useState("");
  const [priceInputMode, setPriceInputMode] = useState<InventoryPriceInputMode>(initialOptionalFields.priceInputMode);
  const [priceInputAmount, setPriceInputAmount] = useState(initialOptionalFields.priceInputAmount);
  const [purchasedAt, setPurchasedAt] = useState(initialOptionalFields.purchasedAt);
  const [freshnessDate, setFreshnessDate] = useState(initialOptionalFields.freshnessDate);
  const [notes, setNotes] = useState(initialOptionalFields.notes);
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [optionalTouched, setOptionalTouched] = useState(false);
  const [purchaseLinksState, setPurchaseLinksState] = useState<{ urls: string[]; isLoaded: boolean }>({
    urls: [],
    isLoaded: false
  });

  const normalizedSubtype = useMemo(
    () => normalizeCustomIngredientSubtype(category, subtype),
    [category, subtype]
  );
  const resolvedType = useMemo(
    () => resolveLegacyIngredientType({ category, subtype: normalizedSubtype }),
    [category, normalizedSubtype]
  );
  const resolvedSubtype = useMemo(
    () => resolveIngredientSubtype({ type: resolvedType, category, subtype: normalizedSubtype }) as IngredientSubtype | null,
    [category, normalizedSubtype, resolvedType]
  );
  const technicalData = useMemo(() => buildCustomIngredientTechnicalData({
    type: resolvedType,
    fermentableColorEbc: parseOptionalNumber(fermentableColorEbc),
    fermentableExtractYieldPct: parseOptionalNumber(fermentableExtractYieldPct),
    hopAlphaAcidPct: parseOptionalNumber(hopAlphaAcidPct),
    hopForm: category === "hop" ? hopForm : null,
    yeastAttenuationPct: parseOptionalNumber(yeastAttenuationPct),
    yeastForm: category === "yeast" ? yeastForm : null
  }), [
    category,
    fermentableColorEbc,
    fermentableExtractYieldPct,
    hopAlphaAcidPct,
    hopForm,
    resolvedType,
    yeastAttenuationPct,
    yeastForm
  ]);
  const unitProfile = useMemo(() => resolveCustomIngredientUnitProfile({
    type: resolvedType,
    category,
    subtype: resolvedSubtype,
    technicalData
  }), [category, resolvedSubtype, resolvedType, technicalData]);
  const placeholderKind = resolveCustomIngredientPlaceholderKind(category, resolvedSubtype);
  const [enteredUnit, setEnteredUnit] = useState<InventoryUnit>(unitProfile.defaultUnit);
  const showInventoryFields = mode === "inventory";
  const resolvedSubmitLabel = submitLabel ?? (showInventoryFields ? "Создать и добавить в запасы" : "Создать свой ингредиент");

  useEffect(() => {
    setDisplayName(initialDisplayName);
  }, [initialDisplayName]);

  useEffect(() => {
    const nextOptionalFields = createInitialInventoryOptionalFields();
    setSubtype(resolveInitialSubtypeValue());
    setEnteredUnit(unitProfile.defaultUnit);
    setPriceInputMode(nextOptionalFields.priceInputMode);
    setPriceInputAmount(nextOptionalFields.priceInputAmount);
    setHopAlphaAcidPct("");
    setHopForm("pellet");
    setHarvestYear("");
    setYeastAttenuationPct("");
    setCountry("");
    setFermentableColorEbc("");
    setFermentableExtractYieldPct("");
    setPurchasedAt(nextOptionalFields.purchasedAt);
    setFreshnessDate(nextOptionalFields.freshnessDate);
    setNotes(nextOptionalFields.notes);
    setOptionalOpen(false);
    setOptionalTouched(false);
    setPurchaseLinksState({
      urls: [],
      isLoaded: false
    });

    if (category !== "yeast") {
      setYeastForm("dry");
    }
  }, [category, initialSubtype, subtypeOptionsKey]);

  useEffect(() => {
    onDisplayNameChange?.(displayName);
  }, [displayName, onDisplayNameChange]);

  useEffect(() => {
    if (!unitProfile.allowedUnits.includes(enteredUnit)) {
      setEnteredUnit(unitProfile.defaultUnit);
    }
  }, [enteredUnit, unitProfile]);

  useEffect(() => {
    if (
      fieldErrors?.priceInputAmountMinor
      || fieldErrors?.purchasePriceMinor
      || fieldErrors?.purchasePrice
      || fieldErrors?.purchasedAt
      || fieldErrors?.freshnessDate
      || fieldErrors?.notes
    ) {
      setOptionalOpen(true);
      setOptionalTouched(true);
    }
  }, [fieldErrors]);

  const purchasePriceError = fieldErrors?.priceInputAmountMinor ?? fieldErrors?.purchasePriceMinor ?? fieldErrors?.purchasePrice;
  const optionalFields = {
    priceInputMode,
    priceInputAmount,
    purchasedAt,
    freshnessDate,
    notes,
    purchaseLinksCount: purchaseLinksState.urls.length
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
        const payload: CustomIngredientSubmitPayload = {
          type: resolvedType,
          category,
          subtype: normalizedSubtype ?? "",
          displayName,
          brand,
          country,
          harvestYear,
          fermentableColorEbc,
          fermentableExtractYieldPct,
          hopAlphaAcidPct,
          hopForm: category === "hop" ? hopForm : "",
          yeastAttenuationPct,
          yeastForm: category === "yeast" ? yeastForm : "",
          defaultDisplayUnit: unitProfile.defaultUnit,
          enteredQuantity,
          enteredUnit
        };

        if (optionalTouched) {
          payload.priceInputMode = priceInputMode;
          payload.priceInputAmount = priceInputAmount;
          payload.purchasedAt = purchasedAt;
          payload.freshnessDate = freshnessDate;
          payload.notes = notes;
          if (purchaseLinksState.isLoaded) {
            payload.purchaseLinksTouched = true;
            payload.purchaseLinks = purchaseLinksState.urls;
          }
        }

        await onSubmit(payload);
      }}
    >
      <div className="rounded-xl border border-zinc-200 p-4">
        <div className="mb-3">
          <h3 className="text-sm font-medium text-zinc-950">Параметры ингредиента</h3>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="flex items-center gap-2">
                <span>Название ингредиента</span>
                <FieldBadge required />
              </span>
              <input
                className="mt-1 w-full rounded-md border px-2 py-2"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={resolveCustomIngredientDisplayNamePlaceholder(placeholderKind)}
              />
              {fieldErrors?.displayName && <span className="text-xs text-red-600">{fieldErrors.displayName}</span>}
            </label>

            <label className="block text-sm">Бренд
              <input
                className="mt-1 w-full rounded-md border px-2 py-2"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder={resolveCustomIngredientBrandPlaceholder(placeholderKind)}
              />
              {fieldErrors?.brand && <span className="text-xs text-red-600">{fieldErrors.brand}</span>}
            </label>
          </div>

          {subtypeOptions.length > 0 ? (
            <label className="block text-sm">{resolveSubtypeFieldLabel()}
              <select className="mt-1 w-full rounded-md border px-2 py-2" value={subtype} onChange={(e) => setSubtype(e.target.value)}>
                {subtypeOptions.map((option) => (
                  <option key={option} value={option}>{formatIngredientSubtypeLabel(category, option)}</option>
                ))}
              </select>
              {fieldErrors?.subtype && <span className="text-xs text-red-600">{fieldErrors.subtype}</span>}
            </label>
          ) : null}

          {category === "fermentable" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-sm">Цвет, EBC
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className="mt-1 w-full rounded-md border px-2 py-2"
                  value={fermentableColorEbc}
                  onChange={(e) => setFermentableColorEbc(e.target.value)}
                  inputMode="decimal"
                  placeholder="Например: 3.5"
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
                  value={fermentableExtractYieldPct}
                  onChange={(e) => setFermentableExtractYieldPct(e.target.value)}
                  inputMode="decimal"
                  placeholder="Например: 81"
                />
                {fieldErrors?.fermentableExtractYieldPct && <span className="text-xs text-red-600">{fieldErrors.fermentableExtractYieldPct}</span>}
              </label>
              <label className="text-sm">Страна
                <select
                  className="mt-1 w-full rounded-md border px-2 py-2"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  <option value="">Выберите страну</option>
                  {customIngredientCountryOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                {fieldErrors?.country && <span className="text-xs text-red-600">{fieldErrors.country}</span>}
              </label>
            </div>
          ) : null}

          {category === "hop" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-sm">Тип хмеля
                <select
                  className="mt-1 w-full rounded-md border px-2 py-2"
                  value={hopForm}
                  onChange={(e) => setHopForm(e.target.value as CustomHopForm)}
                >
                  {customHopSelectableForms.map((option) => (
                    <option key={option} value={option}>{customHopFormLabels[option]}</option>
                  ))}
                </select>
                {fieldErrors?.hopForm && <span className="text-xs text-red-600">{fieldErrors.hopForm}</span>}
              </label>
              <label className="text-sm">Альфа, %
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  className="mt-1 w-full rounded-md border px-2 py-2"
                  value={hopAlphaAcidPct}
                  onChange={(e) => setHopAlphaAcidPct(e.target.value)}
                  inputMode="decimal"
                  placeholder="Например: 12.5"
                />
                {fieldErrors?.hopAlphaAcidPct && <span className="text-xs text-red-600">{fieldErrors.hopAlphaAcidPct}</span>}
              </label>
              <label className="text-sm">Урожай
                <input
                  type="number"
                  min="1900"
                  max="2100"
                  step="1"
                  className="mt-1 w-full rounded-md border px-2 py-2"
                  value={harvestYear}
                  onChange={(e) => setHarvestYear(e.target.value)}
                  inputMode="numeric"
                  placeholder="Необязательно"
                />
                {fieldErrors?.harvestYear && <span className="text-xs text-red-600">{fieldErrors.harvestYear}</span>}
              </label>
            </div>
          ) : null}

          {category === "yeast" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">Тип дрожжей
                <select className="mt-1 w-full rounded-md border px-2 py-2" value={yeastForm} onChange={(e) => setYeastForm(e.target.value as CustomYeastForm)}>
                  {customYeastForms.map((option) => (
                    <option key={option} value={option}>{customYeastFormLabels[option]}</option>
                  ))}
                </select>
                {fieldErrors?.yeastForm && <span className="text-xs text-red-600">{fieldErrors.yeastForm}</span>}
              </label>
              <label className="text-sm">Аттенюация, %
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  className="mt-1 w-full rounded-md border px-2 py-2"
                  value={yeastAttenuationPct}
                  onChange={(e) => setYeastAttenuationPct(e.target.value)}
                  inputMode="decimal"
                  placeholder="Например: 78"
                />
                {fieldErrors?.yeastAttenuationPct && <span className="text-xs text-red-600">{fieldErrors.yeastAttenuationPct}</span>}
              </label>
            </div>
          ) : null}
        </div>
      </div>

      {showInventoryFields ? (
        <>
          <div className="rounded-xl border border-zinc-200 p-4">
            <div className="mb-3">
              <h3 className="text-sm font-medium text-zinc-950">Количество и единица учета</h3>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="custom-required-fields">
              <label className="text-sm">
                <span className="flex items-center gap-2">
                  <span>Количество</span>
                  <FieldBadge required />
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="mt-1 w-full rounded-md border px-2 py-2"
                  value={enteredQuantity}
                  onChange={(e) => setEnteredQuantity(e.target.value)}
                  inputMode="decimal"
                  placeholder="Например: 5"
                />
                {fieldErrors?.enteredQuantity && <span className="text-xs text-red-600">{fieldErrors.enteredQuantity}</span>}
              </label>

              <label className="text-sm">Ед. изм.
                <select className="mt-1 w-full rounded-md border px-2 py-2" value={enteredUnit} onChange={(e) => setEnteredUnit(e.target.value as InventoryUnit)}>
                  {unitProfile.allowedUnits.map((unit) => <option key={unit} value={unit}>{inventoryUnitLabels[unit]}</option>)}
                </select>
                {fieldErrors?.enteredUnit && <span className="text-xs text-red-600">{fieldErrors.enteredUnit}</span>}
              </label>
            </div>
          </div>

          <InventoryOptionalDisclosure
            open={optionalOpen}
            onToggle={toggleOptionalSection}
            fields={optionalFields}
            preferredCurrency={preferredCurrency}
            testId="custom-optional-disclosure"
          >
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-sm">Дата покупки
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="date"
                        className="w-full rounded-md border px-2 py-2"
                        value={purchasedAt}
                        onChange={(e) => setPurchasedAt(e.target.value)}
                      />
                      <button
                        type="button"
                        className="rounded-md border border-zinc-200 px-2 py-2 text-xs text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                        onClick={() => setPurchasedAt("")}
                        aria-label="Очистить дату покупки"
                      >
                        ×
                      </button>
                    </div>
                  </label>

                  <label className="text-sm">Годен до
                    <input type="date" className="mt-1 w-full rounded-md border px-2 py-2" value={freshnessDate} onChange={(e) => setFreshnessDate(e.target.value)} />
                  </label>
                </div>

                <InventoryPriceInput
                  preferredCurrency={preferredCurrency}
                  priceInputMode={priceInputMode}
                  priceInputAmount={priceInputAmount}
                  enteredQuantity={enteredQuantity}
                  enteredUnit={enteredUnit}
                  fieldError={purchasePriceError}
                  onPriceInputModeChange={setPriceInputMode}
                  onPriceInputAmountChange={setPriceInputAmount}
                  type={resolvedType}
                  category={category}
                  subtype={resolvedSubtype}
                  defaultDisplayUnit={unitProfile.defaultUnit}
                  allowedUnits={unitProfile.allowedUnits}
                  measurementDimension={unitProfile.measurementDimension}
                  technicalData={technicalData}
                />

                <IngredientPurchaseLinksField
                  reference={null}
                  enabled={optionalOpen}
                  allowDraftWithoutReference
                  onStateChange={setPurchaseLinksState}
                  testId="custom-purchase-links-field"
                />

                <label className="block text-sm">Заметки
                  <textarea className="mt-1 h-20 w-full rounded-md border px-2 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Например: куплен под конкретную варку" />
                </label>
              </div>
          </InventoryOptionalDisclosure>
        </>
      ) : null}

      <button type="submit" disabled={pending} className="w-full rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60">
        {pending ? "Сохранение..." : resolvedSubmitLabel}
      </button>
    </form>
  );
}
