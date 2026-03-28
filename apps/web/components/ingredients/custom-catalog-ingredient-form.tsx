"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Droplets,
  FlaskConical,
  Leaf,
  Package,
  Wheat
} from "lucide-react";

import type { CatalogCustomIngredientActionResult } from "@/app/(app)/app/catalog/actions";
import type {
  IngredientCategory,
  IngredientDisplayMode
} from "@/features/ingredients/contracts";
import { formatIngredientSubtypeLabel } from "@/features/ingredients/presentation";
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
  maltType?: string | null;
  fermentableMaxUsagePct?: number | null;
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

type UserFacingIngredientKind =
  | "malt"
  | "fermentable"
  | "hop"
  | "yeast"
  | "consumable"
  | "water_treatment";

type ChoiceOption = {
  value: string;
  label: string;
  description?: string;
};

type ToneClasses = {
  border: string;
  bg: string;
  text: string;
  iconBg: string;
  iconText: string;
};

const numberToInput = (value?: number | null) => value == null ? "" : String(value);

const userFacingIngredientKindOptions = [
  {
    value: "malt",
    label: "Солод",
    description: "Базовый, карамельный, жженый",
    category: "fermentable",
    subtype: "malt",
    icon: Wheat
  },
  {
    value: "fermentable",
    label: "Сбраживаемое",
    description: "Сахар, сироп, мед",
    category: "fermentable",
    subtype: "fermentable",
    icon: Wheat
  },
  {
    value: "hop",
    label: "Хмель",
    description: "Сорт и форма",
    category: "hop",
    subtype: null,
    icon: Leaf
  },
  {
    value: "yeast",
    label: "Дрожжи",
    description: "Форма и аттенюация",
    category: "yeast",
    subtype: null,
    icon: FlaskConical
  },
  {
    value: "water_treatment",
    label: "Водоподготовка",
    description: "Кислоты, соли, вода",
    category: "water_treatment",
    subtype: "other",
    icon: Droplets
  },
  {
    value: "consumable",
    label: "Расходник",
    description: "Санитайзеры и осветлители",
    category: "consumable",
    subtype: "other",
    icon: Package
  }
] as const satisfies ReadonlyArray<{
  value: UserFacingIngredientKind;
  label: string;
  description: string;
  category: IngredientCategory;
  subtype: string | null;
  icon: React.ComponentType<{ className?: string }>;
}>;

const capitalizeLabel = (value: string) => value.length
  ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`
  : value;

const resolveSubtypeFieldLabel = (category: IngredientCategory) => {
  if (category === "consumable") {
    return "Тип расходника";
  }

  if (category === "water_treatment") {
    return "Тип средства";
  }

  return "Подтип";
};

const resolveUserFacingIngredientKind = (
  category: IngredientCategory,
  subtype?: string | null
): UserFacingIngredientKind => {
  if (category === "fermentable") {
    return subtype === "malt" ? "malt" : "fermentable";
  }

  return category;
};

const resolveDisplayNamePlaceholder = (kind: UserFacingIngredientKind) => {
  if (kind === "malt") {
    return "Например, Pilsner Malt";
  }

  if (kind === "fermentable") {
    return "Например, Декстроза";
  }

  if (kind === "hop") {
    return "Например, Cascade 2025";
  }

  if (kind === "yeast") {
    return "Например, US-05";
  }

  if (kind === "water_treatment") {
    return "Например, Молочная кислота 80%";
  }

  return "Например, Irish Moss";
};

const resolveKindToneClasses = (category: IngredientCategory): ToneClasses => {
  if (category === "fermentable") {
    return {
      border: "border-amber-300",
      bg: "bg-amber-50",
      text: "text-amber-950",
      iconBg: "bg-amber-100",
      iconText: "text-amber-700"
    };
  }

  if (category === "hop") {
    return {
      border: "border-emerald-300",
      bg: "bg-emerald-50",
      text: "text-emerald-950",
      iconBg: "bg-emerald-100",
      iconText: "text-emerald-700"
    };
  }

  if (category === "yeast") {
    return {
      border: "border-violet-300",
      bg: "bg-violet-50",
      text: "text-violet-950",
      iconBg: "bg-violet-100",
      iconText: "text-violet-700"
    };
  }

  if (category === "water_treatment") {
    return {
      border: "border-sky-300",
      bg: "bg-sky-50",
      text: "text-sky-950",
      iconBg: "bg-sky-100",
      iconText: "text-sky-700"
    };
  }

  return {
    border: "border-zinc-300",
    bg: "bg-zinc-100",
    text: "text-zinc-950",
    iconBg: "bg-zinc-200",
    iconText: "text-zinc-700"
  };
};

const recentHarvestYears = Array.from({ length: 8 }, (_, index) => String(new Date().getFullYear() - index));

const maltTypeOptions: ChoiceOption[] = [
  { value: "unspecified", label: "Не указано" },
  { value: "base", label: "Базовый" },
  { value: "specialty", label: "Специальный" }
];

function FieldBadge({ required }: { required: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
      required
        ? "bg-zinc-950 text-white"
        : "bg-zinc-100 text-zinc-500"
    }`}>
      {required ? "обязательно" : "необязательно"}
    </span>
  );
}

const hopFormChoiceOptions: ChoiceOption[] = customHopForms.map((value) => ({
  value,
  label: customHopFormLabels[value]
}));

const yeastFormChoiceOptions: ChoiceOption[] = customYeastForms.map((value) => ({
  value,
  label: customYeastFormLabels[value]
}));

const physicalFormChoiceOptions: ChoiceOption[] = customPhysicalForms.map((value) => ({
  value,
  label: customPhysicalFormLabels[value]
}));

function ChoicePills({
  options,
  value,
  onChange,
  columnsClassName = "sm:grid-cols-2 xl:grid-cols-4",
  compact = false
}: {
  options: readonly ChoiceOption[];
  value: string;
  onChange: (nextValue: string) => void;
  columnsClassName?: string;
  compact?: boolean;
}) {
  return (
    <div className={`grid gap-2 ${columnsClassName}`}>
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-2xl border text-left transition ${
              compact ? "px-3 py-2.5" : "px-4 py-3"
            } ${
              active
                ? "border-zinc-950 bg-zinc-950 text-white shadow-sm"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
            }`}
          >
            <div className={`font-medium ${compact ? "text-sm" : "text-sm"}`}>{option.label}</div>
            {option.description ? (
              <div className={`mt-1 leading-5 ${compact ? "text-xs" : "text-xs"} ${active ? "text-white/75" : "text-zinc-500"}`}>
                {option.description}
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

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
  const [brand, setBrand] = useState(initial.brand ?? "");
  const [country, setCountry] = useState(initial.country ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [harvestYear, setHarvestYear] = useState(numberToInput(initial.harvestYear));
  const [fermentableColorEbc, setFermentableColorEbc] = useState(numberToInput(initial.fermentableColorEbc));
  const [fermentableExtractYieldPct, setFermentableExtractYieldPct] = useState(numberToInput(initial.fermentableExtractYieldPct));
  const [fermentableProteinPct, setFermentableProteinPct] = useState(numberToInput(initial.fermentableProteinPct));
  const [maltType, setMaltType] = useState(initial.maltType ?? "unspecified");
  const [fermentableMaxUsagePct, setFermentableMaxUsagePct] = useState(numberToInput(initial.fermentableMaxUsagePct));
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
  const activeKind = useMemo(
    () => resolveUserFacingIngredientKind(category, normalizedSubtype),
    [category, normalizedSubtype]
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
    maltType: maltType === "unspecified" ? null : maltType,
    fermentableMaxUsagePct: fermentableMaxUsagePct ? Number(fermentableMaxUsagePct) : null,
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
    fermentableMaxUsagePct,
    fermentableProteinPct,
    hopAlphaAcidPct,
    hopBetaAcidPct,
    hopForm,
    maltType,
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
  const subtypeOptions = useMemo(
    () => category === "fermentable" || !shouldShowCustomIngredientSubtypeField(category)
      ? []
      : ingredientCategorySubtypes[category],
    [category]
  );
  const subtypeChoiceOptions = useMemo(
    () => subtypeOptions.map((option) => ({
      value: option,
      label: capitalizeLabel(formatIngredientSubtypeLabel(category, option))
    })),
    [category, subtypeOptions]
  );
  const unitChoiceOptions = useMemo(
    () => unitProfile.allowedUnits.map((unit) => ({
      value: unit,
      label: inventoryUnitLabels[unit] ?? unit
    })),
    [unitProfile.allowedUnits]
  );
  const harvestYearOptions = useMemo(() => {
    const options = [...recentHarvestYears];
    const currentValue = harvestYear.trim();

    if (currentValue && !options.includes(currentValue)) {
      options.unshift(currentValue);
    }

    return options;
  }, [harvestYear]);

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
  const shouldPreserveSourceMetadata = mode === "edit" || Boolean(initial.derivedFromIngredientId);

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
          Только базовые поля и параметры, которые реально пригодятся потом в складе, рецептах и калькуляторах.
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

      <div className="space-y-4">
        <section className="rounded-3xl border border-zinc-200 bg-zinc-50/80 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-zinc-950">Тип ингредиента</h2>
            <span className="text-xs text-zinc-500">Минимум для заполнения: название и поля с меткой «обязательно».</span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {userFacingIngredientKindOptions.map((option) => {
              const Icon = option.icon;
              const isActive = activeKind === option.value;
              const tone = resolveKindToneClasses(option.category);

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setCategory(option.category);
                    setSubtype(option.subtype ?? "");
                    setResult(null);
                  }}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    isActive
                      ? `${tone.border} ${tone.bg} ${tone.text} shadow-sm`
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 inline-flex rounded-xl p-2 ${isActive ? `${tone.iconBg} ${tone.iconText}` : `${tone.iconBg} ${tone.iconText}`}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="space-y-1">
                      <div className="text-sm font-semibold">{option.label}</div>
                      <div className={`text-xs leading-5 ${isActive ? "opacity-80" : "text-zinc-500"}`}>
                        {option.description}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {subtypeChoiceOptions.length ? (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                <span>{resolveSubtypeFieldLabel(category)}</span>
                <FieldBadge required={false} />
              </div>
              <ChoicePills
                options={subtypeChoiceOptions}
                value={subtype}
                onChange={(nextValue) => setSubtype(nextValue)}
                columnsClassName="sm:grid-cols-2 xl:grid-cols-3"
                compact
              />
              {fieldErrors.subtype ? <span className="block text-xs text-rose-600">{fieldErrors.subtype}</span> : null}
            </div>
          ) : null}

          {fieldErrors.category ? <span className="mt-3 block text-xs text-rose-600">{fieldErrors.category}</span> : null}
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-zinc-950">Карточка ингредиента</h2>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(220px,1fr)_minmax(180px,0.8fr)]">
            <label className="block text-sm">
              <div className="flex items-center gap-2">
                <span>Название ингредиента</span>
                <FieldBadge required />
              </div>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                placeholder={resolveDisplayNamePlaceholder(activeKind)}
              />
              {fieldErrors.displayName ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.displayName}</span> : null}
            </label>
            <label className="block text-sm">
              <div className="flex items-center gap-2">
                <span>Бренд / производитель</span>
                <FieldBadge required={false} />
              </div>
              <input
                value={brand}
                onChange={(event) => setBrand(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                placeholder="Например, Fermentis"
              />
            </label>
            <label className="block text-sm">
              <div className="flex items-center gap-2">
                <span>Страна</span>
                <FieldBadge required={false} />
              </div>
              <input
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                placeholder="Например, USA"
              />
            </label>
          </div>

          <div className="mt-5 border-t border-zinc-200 pt-5">
            {category === "hop" ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px]">
                  <label className="text-sm">
                    <div className="flex items-center gap-2">
                      <span>Альфа-кислота, %</span>
                      <FieldBadge required />
                    </div>
                    <input type="number" min="0" max="100" step="0.1" value={hopAlphaAcidPct} onChange={(event) => setHopAlphaAcidPct(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
                    {fieldErrors.hopAlphaAcidPct ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.hopAlphaAcidPct}</span> : null}
                  </label>
                  <label className="text-sm">
                    <div className="flex items-center gap-2">
                      <span>Бета-кислота, %</span>
                      <FieldBadge required={false} />
                    </div>
                    <input type="number" min="0" max="100" step="0.1" value={hopBetaAcidPct} onChange={(event) => setHopBetaAcidPct(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
                  </label>
                  <label className="text-sm">
                    <div className="flex items-center gap-2">
                      <span>Год урожая</span>
                      <FieldBadge required={false} />
                    </div>
                    <select value={harvestYear} onChange={(event) => setHarvestYear(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm">
                      <option value="">Не указан</option>
                      {harvestYearOptions.map((year) => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                    <span>Форма хмеля</span>
                    <FieldBadge required={false} />
                  </div>
                  <ChoicePills
                    options={hopFormChoiceOptions}
                    value={hopForm}
                    onChange={(nextValue) => setHopForm(nextValue as CustomHopForm)}
                    columnsClassName="sm:grid-cols-2 xl:grid-cols-5"
                    compact
                  />
                </div>
              </div>
            ) : null}

            {category === "fermentable" ? (
              <div className="space-y-4">
                <div className={`grid gap-4 ${activeKind === "malt" ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                  <label className="text-sm">
                    <div className="flex items-center gap-2">
                      <span>Цвет, EBC</span>
                      <FieldBadge required />
                    </div>
                    <input type="number" min="0" step="0.1" value={fermentableColorEbc} onChange={(event) => setFermentableColorEbc(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
                    {fieldErrors.fermentableColorEbc ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.fermentableColorEbc}</span> : null}
                  </label>
                  <label className="text-sm">
                    <div className="flex items-center gap-2">
                      <span>Экстрактивность, %</span>
                      <FieldBadge required />
                    </div>
                    <input type="number" min="0" max="100" step="0.1" value={fermentableExtractYieldPct} onChange={(event) => setFermentableExtractYieldPct(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
                    {fieldErrors.fermentableExtractYieldPct ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.fermentableExtractYieldPct}</span> : null}
                  </label>
                  {activeKind === "malt" ? (
                    <label className="text-sm">
                      <div className="flex items-center gap-2">
                        <span>Белок, %</span>
                        <FieldBadge required={false} />
                      </div>
                      <input type="number" min="0" max="100" step="0.1" value={fermentableProteinPct} onChange={(event) => setFermentableProteinPct(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
                    </label>
                  ) : null}
                </div>

                {activeKind === "malt" ? (
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,220px)]">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                        <span>Тип солода</span>
                        <FieldBadge required={false} />
                      </div>
                      <ChoicePills
                        options={maltTypeOptions}
                        value={maltType}
                        onChange={(nextValue) => setMaltType(nextValue)}
                        columnsClassName="sm:grid-cols-3"
                        compact
                      />
                    </div>
                    <label className="text-sm">
                      <div className="flex items-center gap-2">
                        <span>Макс. засыпь, %</span>
                        <FieldBadge required={false} />
                      </div>
                      <input type="number" min="0" max="100" step="0.1" value={fermentableMaxUsagePct} onChange={(event) => setFermentableMaxUsagePct(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" placeholder="Не указано" />
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}

            {category === "yeast" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                    <span>Форма дрожжей</span>
                    <FieldBadge required />
                  </div>
                  <ChoicePills
                    options={yeastFormChoiceOptions}
                    value={yeastForm}
                    onChange={(nextValue) => setYeastForm(nextValue as CustomYeastForm)}
                    columnsClassName="sm:grid-cols-2 xl:grid-cols-4"
                    compact
                  />
                  {fieldErrors.yeastForm ? <span className="block text-xs text-rose-600">{fieldErrors.yeastForm}</span> : null}
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <label className="text-sm">
                    <div className="flex items-center gap-2">
                      <span>Аттенюация, %</span>
                      <FieldBadge required />
                    </div>
                    <input type="number" min="0" max="100" step="0.1" value={yeastAttenuationPct} onChange={(event) => setYeastAttenuationPct(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
                    {fieldErrors.yeastAttenuationPct ? <span className="mt-1 block text-xs text-rose-600">{fieldErrors.yeastAttenuationPct}</span> : null}
                  </label>
                  <label className="text-sm">
                    <div className="flex items-center gap-2">
                      <span>Флокуляция</span>
                      <FieldBadge required={false} />
                    </div>
                    <input value={yeastFlocculation} onChange={(event) => setYeastFlocculation(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
                  </label>
                  <label className="text-sm">
                    <div className="flex items-center gap-2">
                      <span>Мин. температура, °C</span>
                      <FieldBadge required={false} />
                    </div>
                    <input type="number" min="-20" max="60" step="0.1" value={yeastMinFermentationTempC} onChange={(event) => setYeastMinFermentationTempC(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
                  </label>
                  <label className="text-sm">
                    <div className="flex items-center gap-2">
                      <span>Макс. температура, °C</span>
                      <FieldBadge required={false} />
                    </div>
                    <input type="number" min="-20" max="60" step="0.1" value={yeastMaxFermentationTempC} onChange={(event) => setYeastMaxFermentationTempC(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
                  </label>
                  <label className="text-sm">
                    <div className="flex items-center gap-2">
                      <span>Толерантность к алкоголю, % ABV</span>
                      <FieldBadge required={false} />
                    </div>
                    <input type="number" min="0" max="100" step="0.1" value={alcoholToleranceAbvTypical} onChange={(event) => setAlcoholToleranceAbvTypical(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" />
                  </label>
                </div>
              </div>
            ) : null}

            {(category === "consumable" || category === "water_treatment") ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                    <span>Форма</span>
                    <FieldBadge required={false} />
                  </div>
                  <ChoicePills
                    options={physicalFormChoiceOptions}
                    value={physicalForm}
                    onChange={(nextValue) => setPhysicalForm(nextValue as CustomPhysicalForm)}
                    columnsClassName="sm:grid-cols-2 xl:grid-cols-3"
                    compact
                  />
                </div>
                <label className="text-sm">
                  <div className="flex items-center gap-2">
                    <span>Концентрация / дозировка</span>
                    <FieldBadge required={false} />
                  </div>
                  <input value={concentration} onChange={(event) => setConcentration(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" placeholder="Например, 80% / 1 мл на 10 л" />
                </label>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-zinc-50/80 p-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                <span>Единица по умолчанию</span>
                <FieldBadge required={false} />
              </div>
              <ChoicePills
                options={unitChoiceOptions}
                value={defaultDisplayUnit}
                onChange={(nextValue) => setDefaultDisplayUnit(nextValue as InventoryUnit)}
                columnsClassName="grid-cols-2 sm:grid-cols-4"
                compact
              />
            </div>

            <label className="block text-sm">
              <div className="flex items-center gap-2">
                <span>Заметки</span>
                <FieldBadge required={false} />
              </div>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="mt-1 min-h-28 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm"
                placeholder="Например, своя фасовка, партия, особенности использования"
              />
            </label>
          </div>
        </section>
      </div>

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
                nameRu: shouldPreserveSourceMetadata ? initial.nameRu ?? null : null,
                nameEn: shouldPreserveSourceMetadata ? initial.nameEn ?? null : null,
                aliases: shouldPreserveSourceMetadata ? initial.aliases ?? [] : [],
                brand: brand || null,
                country: country || null,
                productCode: shouldPreserveSourceMetadata ? initial.productCode ?? null : null,
                notes: notes || null,
                displayModeRu: shouldPreserveSourceMetadata ? initial.displayModeRu ?? "auto" : "auto",
                displayNameOverrideRu: shouldPreserveSourceMetadata ? initial.displayNameOverrideRu ?? null : null,
                secondaryNameOverrideRu: shouldPreserveSourceMetadata ? initial.secondaryNameOverrideRu ?? null : null,
                hideSecondaryNameRu: shouldPreserveSourceMetadata ? initial.hideSecondaryNameRu ?? false : false,
                derivedFromIngredientId: initial.derivedFromIngredientId ?? null,
                derivedFromDisplayName: initial.derivedFromDisplayName ?? null,
                harvestYear: harvestYear || null,
                fermentableColorEbc: fermentableColorEbc || null,
                fermentableExtractYieldPct: fermentableExtractYieldPct || null,
                fermentableProteinPct: fermentableProteinPct || null,
                maltType: category === "fermentable" && activeKind === "malt" && maltType !== "unspecified" ? maltType : null,
                fermentableMaxUsagePct: category === "fermentable" && activeKind === "malt" ? fermentableMaxUsagePct || null : null,
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
