import React from "react";

import { CountryFlag } from "@/components/shared/country-flag";
import type {
  IngredientCategory,
  IngredientSubtype,
  IngredientTechnicalData,
  IngredientType
} from "@/features/ingredients/contracts";
import {
  resolveIngredientBrandLabel,
  resolveIngredientCountry,
  resolveIngredientFermentableKindLabel
} from "@/features/ingredients/presentation";
import {
  formatHopFormLabel,
  resolveIngredientTechnicalDataColorRangeEbc
} from "@/features/ingredients/technical-fields";
import { beerColorFromSrm } from "@/features/recipes/beer-color";

export type RecipeIngredientCardSource = {
  type?: IngredientType | null;
  category?: IngredientCategory | null;
  subtype?: IngredientSubtype | null;
  brand?: string | null;
  producer?: string | null;
  brandName?: string | null;
  manufacturer?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  country?: string | null;
  technicalData?: IngredientTechnicalData | null;
};

type RecipeIngredientBadgeAccent = {
  startHex: string;
  averageHex: string;
  endHex: string;
};

export type RecipeIngredientTechnicalBadge = {
  key: string;
  label: string;
  accent?: RecipeIngredientBadgeAccent | null;
};

const formatValue = (value: number) => (
  value % 1 === 0 ? String(value) : value.toFixed(1).replace(/\.0$/, "")
);

const readNumber = (...values: Array<number | null | undefined>) => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
};

const formatPercentRange = ({
  label,
  min,
  max,
  typical
}: {
  label: string;
  min?: number | null;
  max?: number | null;
  typical?: number | null;
}) => {
  if (typeof typical === "number" && Number.isFinite(typical)) {
    return `${label} ${formatValue(typical)}%`;
  }

  const normalizedMin = readNumber(min);
  const normalizedMax = readNumber(max);
  if (normalizedMin != null && normalizedMax != null) {
    return normalizedMin === normalizedMax
      ? `${label} ${formatValue(normalizedMin)}%`
      : `${label} ${formatValue(normalizedMin)}-${formatValue(normalizedMax)}%`;
  }

  if (normalizedMin != null) {
    return `${label} от ${formatValue(normalizedMin)}%`;
  }

  if (normalizedMax != null) {
    return `${label} до ${formatValue(normalizedMax)}%`;
  }

  return null;
};

const ebcToSrm = (value: number) => value / 1.97;

const resolveColorBadgeAccent = (technicalData: IngredientTechnicalData | null | undefined): RecipeIngredientBadgeAccent | null => {
  if (!technicalData || (technicalData.type !== "malt" && technicalData.type !== "fermentable")) {
    return null;
  }

  const range = resolveIngredientTechnicalDataColorRangeEbc(technicalData);
  const startEbc = range?.min ?? null;
  const endEbc = range?.max ?? null;
  if (startEbc == null || endEbc == null) {
    return null;
  }

  const averageEbc = range?.average ?? ((startEbc + endEbc) / 2);
  const start = beerColorFromSrm(ebcToSrm(startEbc));
  const average = beerColorFromSrm(ebcToSrm(averageEbc));
  const end = beerColorFromSrm(ebcToSrm(endEbc));

  return {
    startHex: start.hex,
    averageHex: average.hex,
    endHex: end.hex
  };
};

const formatColorBadge = (technicalData: IngredientTechnicalData | null | undefined) => {
  if (!technicalData || (technicalData.type !== "malt" && technicalData.type !== "fermentable")) {
    return null;
  }

  const range = resolveIngredientTechnicalDataColorRangeEbc(technicalData);
  if (!range) {
    return null;
  }

  if (technicalData.type === "malt" && (technicalData.colorEbcMin != null || technicalData.colorEbcMax != null)) {
    return range.min === range.max
      ? `${formatValue(range.min)} EBC`
      : `${formatValue(range.min)}-${formatValue(range.max)} EBC`;
  }

  return `${formatValue(range.average)} EBC`;
};

export const buildRecipeIngredientTechnicalBadges = (
  source: Pick<RecipeIngredientCardSource, "technicalData">
): RecipeIngredientTechnicalBadge[] => {
  const technicalData = source.technicalData;
  if (!technicalData) {
    return [];
  }

  const badges: RecipeIngredientTechnicalBadge[] = [];
  const seen = new Set<string>();
  const pushBadge = (label?: string | null, accent?: RecipeIngredientBadgeAccent | null) => {
    const trimmed = label?.trim();
    if (!trimmed) {
      return;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    badges.push({ key: `text:${key}`, label: trimmed, accent });
  };

  if (technicalData.type === "hop") {
    const hop = technicalData as Extract<IngredientTechnicalData, { type: "hop" }>;
    pushBadge(formatPercentRange({
      label: "Альфа",
      min: hop.alphaAcidPctMin,
      max: hop.alphaAcidPctMax,
      typical: hop.alphaAcidPctTypical
    }));
    pushBadge(formatHopFormLabel(hop.hopForm));
  } else if (technicalData.type === "malt" || technicalData.type === "fermentable") {
    const fermentable = technicalData as Extract<IngredientTechnicalData, { type: "malt" | "fermentable" }>;
    pushBadge(formatColorBadge(technicalData), resolveColorBadgeAccent(technicalData));
    pushBadge(fermentable.extractPctDryBasis != null ? `Экст-ть ${formatValue(fermentable.extractPctDryBasis)}%` : null);
    pushBadge(
      fermentable.type === "malt" && fermentable.maxUsagePct != null
        ? `до ${formatValue(fermentable.maxUsagePct)} % засыпи`
        : fermentable.type === "fermentable" && fermentable.recommendedMaxPct != null
          ? `до ${formatValue(fermentable.recommendedMaxPct)} % засыпи`
          : null
    );
  } else if (technicalData.type === "yeast") {
    const yeast = technicalData as Extract<IngredientTechnicalData, { type: "yeast" }>;
    pushBadge(yeast.form ? yeast.form.replaceAll("_", " ") : null);
    pushBadge(yeast.attenuationPctTypical != null ? `Атт. ${formatValue(yeast.attenuationPctTypical)}%` : null);
    pushBadge(
      yeast.fermentationTempCMin != null && yeast.fermentationTempCMax != null
        ? `${formatValue(yeast.fermentationTempCMin)}-${formatValue(yeast.fermentationTempCMax)}°C`
        : null
    );
  } else if (technicalData.type === "water_treatment") {
    const waterTreatment = technicalData as Extract<IngredientTechnicalData, { type: "water_treatment" }>;
    const normalizedPreferredUnit = waterTreatment.unitPreferred?.trim().toLowerCase() ?? null;
    pushBadge(normalizedPreferredUnit === "g" || normalizedPreferredUnit === "ml" ? null : waterTreatment.unitPreferred);
  } else if (technicalData.type === "consumable") {
    const consumable = technicalData as Extract<IngredientTechnicalData, { type: "consumable" }>;
    pushBadge(consumable.commonForms?.[0]?.replaceAll("_", " ") ?? null);
    pushBadge(consumable.usageStage?.[0]?.replaceAll("_", " ") ?? null);
  }

  return badges.slice(0, 5);
};

export const RecipeIngredientTechnicalBadges = ({
  badges,
  className = ""
}: {
  badges: RecipeIngredientTechnicalBadge[];
  className?: string;
}) => {
  if (!badges.length) {
    return null;
  }

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`.trim()}>
      {badges.map((badge) => (
        <span
          key={badge.key}
          className={`relative inline-flex items-center rounded-md px-2 py-0.5 text-xs text-zinc-600 ring-1 ring-zinc-200/60 ${badge.accent
            ? "overflow-hidden bg-[linear-gradient(180deg,rgba(250,250,250,0.98),rgba(244,244,245,0.92))]"
            : "bg-zinc-50"
          }`}
        >
          {badge.label}
          {badge.accent ? (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-[4px]"
              style={{
                backgroundImage: `linear-gradient(180deg, ${badge.accent.startHex} 0%, ${badge.accent.averageHex} 52%, ${badge.accent.endHex} 100%)`
              }}
            />
          ) : null}
        </span>
      ))}
    </div>
  );
};

export function RecipeIngredientTitleBlock({
  source,
  primaryName,
  secondaryName,
  titleClassName = "truncate text-sm font-semibold text-zinc-950"
}: {
  source: RecipeIngredientCardSource;
  primaryName: string;
  secondaryName?: string | null;
  titleClassName?: string;
}) {
  const brandLabel = resolveIngredientBrandLabel(source);
  const country = resolveIngredientCountry(source);
  const fermentableKindLabel = resolveIngredientFermentableKindLabel(source);
  const isGenericFermentable = source.category === "fermentable" && source.subtype === "fermentable";
  const showInlineBrand = Boolean(
    brandLabel && (source.subtype === "malt" || source.category === "yeast")
  );
  const showFermentableKindOnBrandLine = Boolean(fermentableKindLabel && isGenericFermentable && !showInlineBrand);
  const showFermentableKindInlineWithTitle = Boolean(fermentableKindLabel && !showFermentableKindOnBrandLine);
  const showCountryInlineWithTitle = country
    && source.category !== "hop"
    && !(source.category === "fermentable" && source.subtype === "fermentable");
  const showCountryOnBrandLine = country
    && (source.category === "hop" || (source.category === "fermentable" && source.subtype === "fermentable"))
    && !showInlineBrand;

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={titleClassName}>{primaryName}</span>
        {showFermentableKindInlineWithTitle ? (
          <span className="inline-flex min-w-0 items-center gap-2 text-xs font-medium text-zinc-600">
            <span aria-hidden="true" className="text-zinc-400">•</span>
            <span className="truncate">{fermentableKindLabel}</span>
          </span>
        ) : null}
        {showInlineBrand ? (
          <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-zinc-700">
            <span aria-hidden="true" className="text-zinc-400">•</span>
            <span className="truncate">{brandLabel}</span>
          </span>
        ) : null}
        {showCountryInlineWithTitle ? (
          <CountryFlag
            countryCode={country.code}
            className="h-3.5 w-[1.15rem]"
          />
        ) : null}
      </div>
      {secondaryName ? <div className="mt-0.5 text-xs text-zinc-500">{secondaryName}</div> : null}
      {!showInlineBrand && brandLabel ? (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-500">
          <span className="font-medium text-zinc-700">{brandLabel}</span>
          {showCountryOnBrandLine ? (
            <CountryFlag
              countryCode={country.code}
              className="h-3.5 w-[1.15rem]"
            />
          ) : null}
          {showFermentableKindOnBrandLine ? (
            <span className="rounded-full bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-600 ring-1 ring-zinc-200/70">
              {fermentableKindLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
