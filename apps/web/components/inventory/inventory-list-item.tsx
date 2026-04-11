"use client";

import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  Calendar,
  Clock,
  Pencil,
  ShoppingCart,
  Tag,
  X
} from "lucide-react";
import { CountryFlag } from "@/components/shared/country-flag";
import type { InventoryListItemDto } from "@/features/inventory/contracts";
import {
  resolveIngredientBrandLabel,
  resolveIngredientCountry,
  resolveIngredientDisplayNames,
  resolveIngredientFermentableKindLabel
} from "@/features/ingredients/presentation";
import { formatHopFormLabel, resolveIngredientTechnicalDataColorRangeEbc } from "@/features/ingredients/technical-fields";
import { beerColorFromSrm } from "@/features/recipes/beer-color";
import { buildInventoryCostDisplay } from "@/features/inventory/display";
import type { SystemCurrency, SystemCurrencyRateMap } from "@/features/system/currency";

import { DeleteInventoryItemButton } from "./delete-inventory-item-button";
import { InventoryItemDetailsEditor } from "./inventory-item-details-editor";
import { InventoryPurchaseLinksTrigger } from "./inventory-purchase-links-trigger";
import {
  InventoryQuantityEditor,
  inventoryFinishedActionInlineClassName,
  inventoryFinishedActionLabel
} from "./inventory-quantity-editor";

type Props = {
  item: InventoryListItemDto;
  preferredCurrency: SystemCurrency;
  currencyRates: SystemCurrencyRateMap;
};

const formatValue = (value: number) => (
  value % 1 === 0 ? String(value) : value.toFixed(1).replace(/\.0$/, "")
);

const ebcToSrm = (value: number) => value / 1.97;

type InventoryBadgeAccent = {
  startHex: string;
  averageHex: string;
  endHex: string;
};

const resolveMaltColorBadgeAccent = (item: InventoryListItemDto): InventoryBadgeAccent | null => {
  const technicalData = item.source.technicalData;
  if (!technicalData || technicalData.type !== "malt") {
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

const formatColorBadge = (item: InventoryListItemDto) => {
  const technicalData = item.source.technicalData;
  if (!technicalData || (technicalData.type !== "malt" && technicalData.type !== "fermentable")) {
    return null;
  }

  if (technicalData.type === "malt") {
    const range = resolveIngredientTechnicalDataColorRangeEbc(technicalData);
    if (range && (technicalData.colorEbcMin != null || technicalData.colorEbcMax != null)) {
      return range.min === range.max
        ? `${formatValue(range.min)} EBC`
        : `${formatValue(range.min)}-${formatValue(range.max)} EBC`;
    }
  }

  const range = resolveIngredientTechnicalDataColorRangeEbc(technicalData);
  if (range) {
    return `${formatValue(range.average)} EBC`;
  }

  return null;
};

type InventoryBadge = {
  key: string;
  label: string;
  accent?: InventoryBadgeAccent | null;
};

const buildTypedBadges = (item: InventoryListItemDto) => {
  const technicalData = item.source.technicalData;
  if (!technicalData) {
    return [];
  }

  if (technicalData.type === "hop") {
    const hop = technicalData as Extract<NonNullable<typeof technicalData>, { type: "hop" }>;
    const hopFormLabel = formatHopFormLabel(hop.hopForm);
    return [
      hop.alphaAcidPctTypical != null ? { label: `Альфа ${formatValue(hop.alphaAcidPctTypical)}%` } : null,
      hopFormLabel ? { label: hopFormLabel } : null,
      item.source.harvestYear != null ? { label: `Урожай ${item.source.harvestYear}` } : null
    ].filter((badge): badge is { label: string; accent?: InventoryBadgeAccent | null } => Boolean(badge));
  }

  if (technicalData.type === "malt" || technicalData.type === "fermentable") {
    const fermentable = technicalData as Extract<NonNullable<typeof technicalData>, { type: "malt" | "fermentable" }>;
    return [
      formatColorBadge(item)
        ? { label: formatColorBadge(item) ?? "", accent: resolveMaltColorBadgeAccent(item) }
        : null,
      fermentable.extractPctDryBasis != null ? { label: `Экст-ть ${formatValue(fermentable.extractPctDryBasis)}%` } : null,
      fermentable.type === "malt" && fermentable.maxUsagePct != null
        ? { label: `до ${formatValue(fermentable.maxUsagePct)} % засыпи` }
        : fermentable.type === "fermentable" && fermentable.recommendedMaxPct != null
          ? { label: `до ${formatValue(fermentable.recommendedMaxPct)} % засыпи` }
          : null
    ].filter((badge): badge is { label: string; accent?: InventoryBadgeAccent | null } => Boolean(badge));
  }

  if (technicalData.type === "yeast") {
    const yeast = technicalData as Extract<NonNullable<typeof technicalData>, { type: "yeast" }>;
    return [
      yeast.form ? { label: yeast.form.replaceAll("_", " ") } : null,
      yeast.attenuationPctTypical != null ? { label: `Атт. ${formatValue(yeast.attenuationPctTypical)}%` } : null,
      yeast.fermentationTempCMin != null && yeast.fermentationTempCMax != null
        ? { label: `${formatValue(yeast.fermentationTempCMin)}-${formatValue(yeast.fermentationTempCMax)}°C` }
        : null
    ].filter((badge): badge is { label: string; accent?: InventoryBadgeAccent | null } => Boolean(badge));
  }

  if (technicalData.type === "water_treatment") {
    const waterTreatment = technicalData as Extract<NonNullable<typeof technicalData>, { type: "water_treatment" }>;
    const normalizedPreferredUnit = waterTreatment.unitPreferred?.trim().toLowerCase() ?? null;
    const preferredUnit = normalizedPreferredUnit === "g" || normalizedPreferredUnit === "ml"
      ? null
      : waterTreatment.unitPreferred;

    return [
      preferredUnit ? { label: preferredUnit } : null
    ].filter((badge): badge is { label: string; accent?: InventoryBadgeAccent | null } => Boolean(badge));
  }

  if (technicalData.type === "consumable") {
    const consumable = technicalData as Extract<NonNullable<typeof technicalData>, { type: "consumable" }>;
    return [
      consumable.commonForms?.[0] ? { label: consumable.commonForms[0].replaceAll("_", " ") } : null,
      consumable.usageStage?.[0] ? { label: consumable.usageStage[0].replaceAll("_", " ") } : null
    ].filter((badge): badge is { label: string; accent?: InventoryBadgeAccent | null } => Boolean(badge));
  }

  return [];
};

const buildTechnicalBadges = (item: InventoryListItemDto) => {
  const badges: InventoryBadge[] = [];
  const seen = new Set<string>();

  const pushBadge = (badge?: { label?: string | null; accent?: InventoryBadgeAccent | null } | null) => {
    const trimmed = badge?.label?.trim();
    if (!trimmed) {
      return;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    badges.push({
      key: `text:${key}`,
      label: trimmed,
      accent: badge?.accent
    });
  };

  for (const badge of buildTypedBadges(item)) {
    pushBadge(badge);
  }

  const allowSummaryFallback = item.source.category !== "water_treatment";

  if (allowSummaryFallback && item.source.summary && badges.length === 0) {
    pushBadge({ label: item.source.summary });
  }

  return badges.slice(0, 5);
};

const chemicalFormulaSubscriptPattern = /[A-Za-zА-Яа-я)\]]/;

const renderChemicalFormula = (formula: string) => {
  const symbols = [...formula];
  const parts: React.ReactNode[] = [];
  let index = 0;

  while (index < symbols.length) {
    const symbol = symbols[index];
    const previous = index > 0 ? symbols[index - 1] : null;

    if (/\d/.test(symbol) && previous && chemicalFormulaSubscriptPattern.test(previous)) {
      const start = index;
      while (index < symbols.length && /\d/.test(symbols[index])) {
        index += 1;
      }

      parts.push(
        <sub key={`${formula}-sub-${start}`} className="text-[0.8em] leading-none">
          {symbols.slice(start, index).join("")}
        </sub>
      );
      continue;
    }

    parts.push(<React.Fragment key={`${formula}-char-${index}`}>{symbol}</React.Fragment>);
    index += 1;
  }

  return parts;
};

const FormulaLabel = ({ formula }: { formula: string }) => (
  <span
    aria-label={`Формула: ${formula}`}
    className="whitespace-nowrap text-[15px] font-medium leading-none tracking-tight text-zinc-700"
  >
    {renderChemicalFormula(formula)}
  </span>
);

const isFreshnessCritical = (freshnessDate: Date | null) => {
  if (!freshnessDate) return false;
  const daysUntil = (freshnessDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return daysUntil < 30;
};

const isExpired = (freshnessDate: Date | null) => {
  if (!freshnessDate) return false;
  return freshnessDate.getTime() < Date.now();
};

export function InventoryListItem({ item, preferredCurrency, currencyRates }: Props) {
  const badges = buildTechnicalBadges(item);
  const { primaryName, secondaryName } = resolveIngredientDisplayNames(item.source);
  const waterTreatmentTechnicalData = item.source.technicalData?.type === "water_treatment"
    ? item.source.technicalData as Extract<NonNullable<typeof item.source.technicalData>, { type: "water_treatment" }>
    : null;
  const titleFormula = waterTreatmentTechnicalData?.formula?.trim() ?? null;
  const brandLabel = resolveIngredientBrandLabel(item.source);
  const fermentableKindLabel = resolveIngredientFermentableKindLabel(item.source);
  const isGenericFermentable = item.source.category === "fermentable" && item.source.subtype === "fermentable";
  const showInlineBrand = Boolean(
    brandLabel && (item.source.subtype === "malt" || item.source.category === "yeast")
  );
  const showFermentableKindOnBrandLine = Boolean(fermentableKindLabel && isGenericFermentable && !showInlineBrand);
  const showFermentableKindInlineWithTitle = Boolean(fermentableKindLabel && !showFermentableKindOnBrandLine);
  const country = resolveIngredientCountry(item.source);
  const showCountryInlineWithTitle = country
    && item.source.category !== "hop"
    && !(item.source.category === "fermentable" && item.source.subtype === "fermentable");
  const showCountryOnBrandLine = country
    && (item.source.category === "hop" || (item.source.category === "fermentable" && item.source.subtype === "fermentable"))
    && !showInlineBrand;
  const costSummary = buildInventoryCostDisplay({
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
    technicalData: item.source.technicalData,
    purchasePriceMinor: item.purchasePriceMinor,
    purchaseCurrency: item.purchaseCurrency,
    purchaseQuantityNormalizedUnit: item.purchaseQuantityNormalizedUnit,
    normalizedUnitCostMinorRub: item.normalizedUnitCostMinorRub
  }, preferredCurrency, currencyRates);

  const isEmpty = item.normalizedQuantity <= 0;
  const expired = isExpired(item.freshnessDate);
  const freshnessCritical = !expired && isFreshnessCritical(item.freshnessDate);
  const detailHref = item.source.sourceKind === "custom"
    ? `/app/catalog/custom/${item.source.sourceId}`
    : `/app/catalog/system/${item.source.sourceId}`;
  const ownershipBadgeLabel = item.source.sourceKind === "custom"
    ? (item.source.derivedFromIngredientId ? "Измененный" : "Свой")
    : null;

  return (
    <li className={`relative rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${isEmpty ? "border-zinc-200/60 opacity-60" : expired ? "border-red-200" : freshnessCritical ? "border-amber-200" : "border-zinc-200"
      }`}>
      <div className="absolute right-2.5 top-2.5 z-10 flex items-center gap-1">
        <InventoryQuantityEditor
          item={item}
          hideEditor
          renderFinishedAction={({ onClick, isPending }) => (
            <button
              type="button"
              onClick={onClick}
              disabled={isPending}
              className={inventoryFinishedActionInlineClassName}
            >
              {isPending ? "..." : inventoryFinishedActionLabel}
            </button>
          )}
        />
        <InventoryItemDetailsEditor
          item={item}
          preferredCurrency={preferredCurrency}
          currencyRates={currencyRates}
          renderTrigger={(onClick) => (
            <button
              type="button"
              onClick={onClick}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Редактировать"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
        />
        <DeleteInventoryItemButton
          inventoryItemId={item.id}
          displayName={primaryName}
          renderTrigger={(onClick, isPending) => (
            <button
              type="button"
              onClick={onClick}
              disabled={isPending}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
              aria-label="Удалить"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        />
      </div>

      <div className="flex items-start gap-4 pr-6">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                {titleFormula ? <FormulaLabel formula={titleFormula} /> : null}
                <h3 className="text-base font-semibold text-zinc-950">
                  <Link href={detailHref} className="underline-offset-4 hover:underline">
                    {primaryName}
                  </Link>
                </h3>
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
              {secondaryName ? <p className="text-xs text-zinc-500">{secondaryName}</p> : null}
              {!showInlineBrand && brandLabel ? (
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-500">
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
            {ownershipBadgeLabel ? (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">{ownershipBadgeLabel}</span>
            ) : null}
            {item.archivedAt ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200">
                <Archive className="h-2.5 w-2.5" />
                Архив
              </span>
            ) : null}
          </div>

          {badges.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
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
          ) : null}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
            {costSummary.totalPrice ? (
              <span className="inline-flex items-center gap-1">
                <ShoppingCart className="h-3 w-3" />
                {costSummary.totalPrice}
              </span>
            ) : null}
            {costSummary.unitPrice ? (
              <span className="inline-flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {costSummary.unitPrice}
              </span>
            ) : null}
            {item.purchasedAt ? (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {item.purchasedAt.toLocaleDateString("ru-RU")}
              </span>
            ) : null}
            {item.freshnessDate ? (
              <span className={`inline-flex items-center gap-1 ${expired ? "font-medium text-red-600" : freshnessCritical ? "font-medium text-amber-600" : ""
                }`}>
                {expired || freshnessCritical ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                {expired ? "Просрочен" : "Годен до"} {item.freshnessDate.toLocaleDateString("ru-RU")}
              </span>
            ) : null}
            <InventoryPurchaseLinksTrigger
              reference={{
                source: item.source.sourceKind,
                id: item.source.sourceId
              }}
              summary={item.source.purchaseLinks}
            />
          </div>

          {item.notes ? (
            <p className="text-sm leading-relaxed text-zinc-500">{item.notes}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2 pt-8">
          <InventoryQuantityEditor item={item} showFinishedAction={false} />
        </div>
      </div>
    </li>
  );
}
