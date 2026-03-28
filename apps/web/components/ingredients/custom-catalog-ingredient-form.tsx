"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { CatalogCustomIngredientActionResult } from "@/app/(app)/app/catalog/actions";
import { IngredientCategorySelector } from "@/components/ingredients/ingredient-category-selector";
import type {
  IngredientCategory,
  IngredientDisplayMode
} from "@/features/ingredients/contracts";
import { ingredientDisplayModes } from "@/features/ingredients/contracts";
import { ingredientCategorySubtypes, resolveLegacyIngredientType } from "@/features/ingredients/taxonomy";
import {
  buildCustomIngredientTechnicalData,
  customHopFormLabels,
  customHopForms,
  customPhysicalFormLabels,
  customPhysicalForms,
  customYeastFormLabels,
  customYeastForms,
  normalizeCustomIngredientSubtype,
  resolveCustomIngredientUnitProfile,
  resolveDefaultCustomIngredientSubtype,
  shouldShowCustomIngredientSubtypeField,
  type CustomHopForm,
  type CustomPhysicalForm,
  type CustomYeastForm
} from "@/features/inventory/custom-ingredient";
import { inventoryUnitLabels, type InventoryUnit } from "@/features/inventory/units";

export type CustomCatalogIngredientFormInitialValue = {
  id?: string;
  category: IngredientCategory;
  subtype?: string | null;
  displayName: string;
  nameRu?: string | null;
  nameEn?: string | null;
  aliases?: string[];
  brand?: string | null;
  country?: string | null;
  productCode?: string | null;
  notes?: string | null;
  displayModeRu?: IngredientDisplayMode;
  displayNameOverrideRu?: string | null;
  secondaryNameOverrideRu?: string | null;
  hideSecondaryNameRu?: boolean;
  derivedFromIngredientId?: string | null;
  derivedFromDisplayName?: string | null;
  harvestYear?: number | null;
  fermentableColorEbc?: number | null;
  fermentableExtractYieldPct?: number | null;
  fermentableProteinPct?: number | null;
  hopAlphaAcidPct?: number | null;
  hopBetaAcidPct?: number | null;
  hopForm?: CustomHopForm | null;
  yeastAttenuationPct?: number | null;
  yeastForm?: CustomYeastForm | null;
  yeastFlocculation?: string | null;
  yeastMinFermentationTempC?: number | null;
  yeastMaxFermentationTempC?: number | null;
  alcoholToleranceAbvTypical?: number | null;
  physicalForm?: CustomPhysicalForm | null;
  concentration?: string | null;
  defaultDisplayUnit?: InventoryUnit | null;
};

type Props = {
  mode: "create" | "edit";
  initial: CustomCatalogIngredientFormInitialValue;
  submitLabel: string;
  onSubmit: (payload: Record<string, unknown>) => Promise<CatalogCustomIngredientActionResult>;
  onDelete?: () => Promise<CatalogCustomIngredientActionResult>;
};

const numberToInput = (value?: number | null) => value == null ? "" : String(value);

const parseAliasesInput = (value: string) => Array.from(new Set(
  value
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean)
));

const resolveSubtypeLabel = (category: IngredientCategory) => (
  category === "fermentable" ? "Тип ферментируемого" : "Подтип"
);

export function CustomCatalogIngredientForm({
  mode,
  initial,
  submitLabel,
  onSubmit,
  onDelete
}: Props) {
  const router = useRouter();
  const [result, setResult] = useState<CatalogCustomIngredientActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [category, setCategory] = useState<IngredientCategory>(initial.category);
  const [subtype, setSubtype] = useState(initial.subtype ?? resolveDefaultCustomIngredientSubtype(initial.category) ?? "");
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [nameRu, setNameRu] = useState(initial.nameRu ?? "");
  const [nameEn, setNameEn] = useState(initial.nameEn ?? "");
  const [aliasesText, setAliasesText] = useState((initial.aliases ?? []).join("\n"));
  const [brand, setBrand] = useState(initial.brand ?? "");
  const [country, setCountry] = useState(initial.country ?? "");
  const [productCode, setProductCode] = useState(initial.productCode ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [displayModeRu, setDisplayModeRu] = useState<IngredientDisplayMode>(initial.displayModeRu ?? "auto");
  const [displayNameOverrideRu, setDisplayNameOverrideRu] = useState(initial.displayNameOverrideRu ?? "");
  const [secondaryNameOverrideRu, setSecondaryNameOverrideRu] = useState(initial.secondaryNameOverrideRu ?? "");
  const [hideSecondaryNameRu, setHideSecondaryNameRu] = useState(initial.hideSecondaryNameRu ?? false);
  const [harvestYear, setHarvestYear] = useState(numberToInput(initial.harvestYear));
  const [fermentableColorEbc, setFermentableColorEbc] = useState(numberToInput(initial.fermentableColorEbc));
  const [fermentableExtractYieldPct, setFermentableExtractYieldPct] = useState(numberToInput(initial.fermentableExtractYieldPct));
  const [fermentableProteinPct, setFermentableProteinPct] = useState(numberToInput(initial.fermentableProteinPct));
  const [hopAlphaAcidPct, setHopAlphaAcidPct] = useState(numberToInput(initial.hopAlphaAcidPct));
  const [hopBetaAcidPct, setHopBetaAcidPct] = useState(numberToInput(initial.hopBetaAcidPct));
  const [hopForm, setHopForm] = useState<CustomHopForm>(initial.hopForm ?? "pellet");
  const [yeastAttenuationPct, setYeastAttenuationPct] = useState(numberToInput(initial.yeastAttenuationPct));
  const [yeastForm, setYeastForm] = useState<CustomYeastForm>(initial.yeastForm ?? "dry");
  const [yeastFlocculation, setYeastFlocculation] = useState(initial.yeastFlocculation ?? "");
  const [yeastMinFermentationTempC, setYeastMinFermentationTempC] = useState(numberToInput(initial.yeastMinFermentationTempC));
  const [yeastMaxFermentationTempC, setYeastMaxFermentationTempC] = useState(numberToInput(initial.yeastMaxFermentationTempC));
  const [alcoholToleranceAbvTypical, setAlcoholToleranceAbvTypical] = useState(numberToInput(initial.alcoholToleranceAbvTypical));
  const [physicalForm, setPhysicalForm] = useState<CustomPhysicalForm>(initial.physicalForm ?? "liquid");
  const [concentration, setConcentration] = useState(initial.concentration ?? "");
  const previousCategoryRef = useRef(initial.category);
  const [defaultDisplayUnit, setDefaultDisplayUnit] = useState<InventoryUnit>(initial.defaultDisplayUnit ?? "g");

  const normalizedSubtype = useMemo(
    () => normalizeCustomIngredientSubtype(category, subtype),
    [category, subtype]
  );
  const type = useMemo(
    () => resolveLegacyIngredientType({ category, subtype: normalizedSubtype }),
    [category, normalizedSubtype]
  );
  const technicalData = useMemo(() => buildCustomIngredientTechnicalData({
    type,
    fermentableColorEbc: fermentableColorEbc ? Number(fermentableColorEbc) : null,
    fermentableExtractYieldPct: fermentableExtractYieldPct ? Number(fermentableExtractYieldPct) : null,
    fermentableProteinPct: fermentableProteinPct ? Number(fermentableProteinPct) : null,
    hopAlphaAcidPct: hopAlphaAcidPct ? Number(hopAlphaAcidPct) : null,
    hopBetaAcidPct: hopBetaAcidPct ? Number(hopBetaAcidPct) : null,
    hopForm: category === "hop" ? hopForm : null,
    yeastAttenuationPct: yeastAttenuationPct ? Number(yeastAttenuationPct) : null,
    yeastForm: category === "yeast" ? yeastForm : null,
    yeastFlocculation: category === "yeast" ? yeastFlocculation || null : null,
    yeastMinFermentationTempC: yeastMinFermentationTempC ? Number(yeastMinFermentationTempC) : null,
    yeastMaxFermentationTempC: yeastMaxFermentationTempC ? Number(yeastMaxFermentationTempC) : null,
    alcoholToleranceAbvTypical: alcoholToleranceAbvTypical ? Number(alcoholToleranceAbvTypical) : null,
    physicalForm: category === "consumable" || category === "water_treatment" ? physicalForm : null,
    concentration: category === "consumable" || category === "water_treatment" ? concentration || null : null,
    unitPreferred: defaultDisplayUnit
  }), [
    alcoholToleranceAbvTypical,
    category,
    concentration,
    defaultDisplayUnit,
    fermentableColorEbc,
    fermentableExtractYieldPct,
    fermentableProteinPct,
    hopAlphaAcidPct,
    hopBetaAcidPct,
    hopForm,
    physicalForm,
    type,
    yeastAttenuationPct,
    yeastFlocculation,
    yeastForm,
    yeastMaxFermentationTempC,
    yeastMinFermentationTempC
  ]);
  const unitProfile = useMemo(() => resolveCustomIngredientUnitProfile({
    type,
    category,
    subtype: normalizedSubtype,
    technicalData
  }), [category, normalizedSubtype, technicalData, type]);

  useEffect(() => {
    if (previousCategoryRef.current === category) {
      return;
    }

    previousCategoryRef.current = category;
    setSubtype(resolveDefaultCustomIngredientSubtype(category) ?? "");
    setDefaultDisplayUnit(unitProfile.defaultUnit);
    setResult(null);
  }, [category, unitProfile.defaultUnit]);

  useEffect(() => {
    if (!unitProfile.allowedUnits.includes(defaultDisplayUnit)) {
      setDefaultDisplayUnit(unitProfile.defaultUnit);
    }
  }, [defaultDisplayUnit, unitProfile]);

  const fieldErrors = result?.fieldErrors ?? {};

  return (
    <div className="space-y-6 rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="space-y-2">
        <div className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
          {mode === "create" ? "Новый пользовательский ингредиент" : "Редактирование пользовательского ингредиента"}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
          {mode === "create" ? "Свой ингредиент" : "Редактирование"}
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-zinc-600">
          Каталожные характеристики редактируются здесь. Складские остатки, упаковка и цена остаются в разделе «Мой склад».
        </p>
      </div>

      {initial.derivedFromDisplayName ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Базовый системный ингредиент: <strong>{initial.derivedFromDisplayName}</strong>. При сохранении будет создана отдельная приватная версия, не влияющая на общий каталог.
        </div>
      ) : null}

      {result ? (
        <div className={`rounded-2xl px-4 py-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>
          {result.message}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-4 rounded-3xl border border-zinc-200 bg-zinc-50/80 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-500">Основное</h2>

          <IngredientCategorySelector value={category} onChange={setCategory} />

          {shouldShowCustomIngredientSubtypeField(category) ? (
            <label className="block text-sm">
              {resolveSubtypeLabel(category)}
              <select
                value={subtype}
                onChange={(event) => setSubtype(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
              >
                {ingredientCategorySubtypes[category].map((option) => (
                  <option key={option} value={option}>{option.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              Основное название
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                placeholder="Например, Cascade 2025"
              />
              {fieldErrors.displayName ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.displayName}</span> : null}
            </label>
            <label className="block text-sm">
              Код / артикул
              <input
                value={productCode}
                onChange={(event) => setProductCode(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                placeholder="Опционально"
              />
            </label>
            <label className="block text-sm">
              `name_ru`
              <input
                value={nameRu}
                onChange={(event) => setNameRu(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                placeholder="Русское имя"
              />
            </label>
            <label className="block text-sm">
              `name_en`
              <input
                value={nameEn}
                onChange={(event) => setNameEn(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                placeholder="Source/original name"
              />
            </label>
            <label className="block text-sm">
              Бренд / производитель
              <input
                value={brand}
                onChange={(event) => setBrand(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                placeholder="Например, Fermentis"
              />
            </label>
            <label className="block text-sm">
              Страна
              <input
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                placeholder="Например, USA"
              />
            </label>
          </div>

          <label className="block text-sm">
            Алиасы
            <textarea
              value={aliasesText}
              onChange={(event) => setAliasesText(event.target.value)}
              className="mt-1 min-h-28 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm"
              placeholder="По одному алиасу на строку или через запятую"
            />
          </label>

          <label className="block text-sm">
            Заметки
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-1 min-h-28 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm"
              placeholder="Комментарий, особенности, supplier note"
            />
          </label>
        </section>

        <section className="space-y-4 rounded-3xl border border-zinc-200 bg-zinc-50/80 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-500">Отображение</h2>

          <label className="block text-sm">
            Display mode
            <select
              value={displayModeRu}
              onChange={(event) => setDisplayModeRu(event.target.value as IngredientDisplayMode)}
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
            >
              {ingredientDisplayModes.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            Display override
            <input
              value={displayNameOverrideRu}
              onChange={(event) => setDisplayNameOverrideRu(event.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
              placeholder="Опционально"
            />
          </label>

          <label className="block text-sm">
            Secondary override
            <input
              value={secondaryNameOverrideRu}
              onChange={(event) => setSecondaryNameOverrideRu(event.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
              placeholder="Опционально"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={hideSecondaryNameRu}
              onChange={(event) => setHideSecondaryNameRu(event.target.checked)}
              className="rounded border-zinc-300"
            />
            Скрывать вторичное название в RU UI
          </label>

          <label className="block text-sm">
            Единица по умолчанию
            <select
              value={defaultDisplayUnit}
              onChange={(event) => setDefaultDisplayUnit(event.target.value as InventoryUnit)}
              className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
            >
              {unitProfile.allowedUnits.map((unit) => (
                <option key={unit} value={unit}>{inventoryUnitLabels[unit] ?? unit}</option>
              ))}
            </select>
          </label>
        </section>
      </div>

      <section className="space-y-4 rounded-3xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-500">Ключевые характеристики</h2>

        {category === "hop" ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm">Alpha acid, %
              <input type="number" min="0" max="100" step="0.1" value={hopAlphaAcidPct} onChange={(event) => setHopAlphaAcidPct(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
              {fieldErrors.hopAlphaAcidPct ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.hopAlphaAcidPct}</span> : null}
            </label>
            <label className="text-sm">Beta acid, %
              <input type="number" min="0" max="100" step="0.1" value={hopBetaAcidPct} onChange={(event) => setHopBetaAcidPct(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
            </label>
            <label className="text-sm">Crop year
              <input type="number" min="1900" max="2100" step="1" value={harvestYear} onChange={(event) => setHarvestYear(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
            </label>
            <label className="text-sm">Form
              <select value={hopForm} onChange={(event) => setHopForm(event.target.value as CustomHopForm)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm">
                {customHopForms.map((option) => (
                  <option key={option} value={option}>{customHopFormLabels[option]}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {category === "fermentable" ? (
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm">Цвет, EBC
              <input type="number" min="0" step="0.1" value={fermentableColorEbc} onChange={(event) => setFermentableColorEbc(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
              {fieldErrors.fermentableColorEbc ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.fermentableColorEbc}</span> : null}
            </label>
            <label className="text-sm">Экстракт, %
              <input type="number" min="0" max="100" step="0.1" value={fermentableExtractYieldPct} onChange={(event) => setFermentableExtractYieldPct(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
              {fieldErrors.fermentableExtractYieldPct ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.fermentableExtractYieldPct}</span> : null}
            </label>
            <label className="text-sm">Protein, %
              <input type="number" min="0" max="100" step="0.1" value={fermentableProteinPct} onChange={(event) => setFermentableProteinPct(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
            </label>
          </div>
        ) : null}

        {category === "yeast" ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-sm">Форма
              <select value={yeastForm} onChange={(event) => setYeastForm(event.target.value as CustomYeastForm)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm">
                {customYeastForms.map((option) => (
                  <option key={option} value={option}>{customYeastFormLabels[option]}</option>
                ))}
              </select>
              {fieldErrors.yeastForm ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.yeastForm}</span> : null}
            </label>
            <label className="text-sm">Attenuation, %
              <input type="number" min="0" max="100" step="0.1" value={yeastAttenuationPct} onChange={(event) => setYeastAttenuationPct(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
              {fieldErrors.yeastAttenuationPct ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.yeastAttenuationPct}</span> : null}
            </label>
            <label className="text-sm">Flocculation
              <input value={yeastFlocculation} onChange={(event) => setYeastFlocculation(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
            </label>
            <label className="text-sm">Min temp, °C
              <input type="number" min="-20" max="60" step="0.1" value={yeastMinFermentationTempC} onChange={(event) => setYeastMinFermentationTempC(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
            </label>
            <label className="text-sm">Max temp, °C
              <input type="number" min="-20" max="60" step="0.1" value={yeastMaxFermentationTempC} onChange={(event) => setYeastMaxFermentationTempC(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
            </label>
            <label className="text-sm">Alcohol tolerance, % ABV
              <input type="number" min="0" max="100" step="0.1" value={alcoholToleranceAbvTypical} onChange={(event) => setAlcoholToleranceAbvTypical(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
            </label>
          </div>
        ) : null}

        {(category === "consumable" || category === "water_treatment") ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-sm">Форма
              <select value={physicalForm} onChange={(event) => setPhysicalForm(event.target.value as CustomPhysicalForm)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm">
                {customPhysicalForms.map((option) => (
                  <option key={option} value={option}>{customPhysicalFormLabels[option]}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">Concentration / usage
              <input value={concentration} onChange={(event) => setConcentration(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" placeholder="Например, 80% / 1 мл на 10 л" />
            </label>
            <label className="text-sm">Единица по умолчанию
              <select value={defaultDisplayUnit} onChange={(event) => setDefaultDisplayUnit(event.target.value as InventoryUnit)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm">
                {unitProfile.allowedUnits.map((unit) => (
                  <option key={unit} value={unit}>{inventoryUnitLabels[unit] ?? unit}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-5">
        <div className="flex flex-wrap gap-2">
          {onDelete ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  const nextResult = await onDelete();
                  setResult(nextResult);
                  if (nextResult.ok) {
                    router.push("/app/catalog?view=mine");
                    router.refresh();
                  }
                });
              }}
              className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-medium text-rose-700 disabled:opacity-60"
            >
              Удалить
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700"
          >
            Назад
          </button>
        </div>

        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              const nextResult = await onSubmit({
                type,
                category,
                subtype: normalizedSubtype,
                displayName,
                nameRu: nameRu || null,
                nameEn: nameEn || null,
                aliases: parseAliasesInput(aliasesText),
                brand: brand || null,
                country: country || null,
                productCode: productCode || null,
                notes: notes || null,
                displayModeRu,
                displayNameOverrideRu: displayNameOverrideRu || null,
                secondaryNameOverrideRu: secondaryNameOverrideRu || null,
                hideSecondaryNameRu,
                derivedFromIngredientId: initial.derivedFromIngredientId ?? null,
                derivedFromDisplayName: initial.derivedFromDisplayName ?? null,
                harvestYear: harvestYear || null,
                fermentableColorEbc: fermentableColorEbc || null,
                fermentableExtractYieldPct: fermentableExtractYieldPct || null,
                fermentableProteinPct: fermentableProteinPct || null,
                hopAlphaAcidPct: hopAlphaAcidPct || null,
                hopBetaAcidPct: hopBetaAcidPct || null,
                hopForm: category === "hop" ? hopForm : null,
                yeastAttenuationPct: yeastAttenuationPct || null,
                yeastForm: category === "yeast" ? yeastForm : null,
                yeastFlocculation: category === "yeast" ? yeastFlocculation || null : null,
                yeastMinFermentationTempC: yeastMinFermentationTempC || null,
                yeastMaxFermentationTempC: yeastMaxFermentationTempC || null,
                alcoholToleranceAbvTypical: alcoholToleranceAbvTypical || null,
                physicalForm: category === "consumable" || category === "water_treatment" ? physicalForm : null,
                concentration: category === "consumable" || category === "water_treatment" ? concentration || null : null,
                defaultDisplayUnit
              });
              setResult(nextResult);
              if (nextResult.ok && nextResult.ingredientId) {
                router.push(`/app/catalog/custom/${nextResult.ingredientId}`);
                router.refresh();
              }
            });
          }}
          className="rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {isPending ? "Сохраняем..." : submitLabel}
        </button>
      </div>
    </div>
  );
}
