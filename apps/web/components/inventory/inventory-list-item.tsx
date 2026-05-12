"use client";

import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  Calendar,
  Clock,
  MoreHorizontal,
  ShoppingCart,
  Tag
} from "lucide-react";
import { CountryFlag } from "@/components/shared/country-flag";
import type { IngredientPickerQuickStartResultByContext } from "@/features/ingredients/contracts";
import type { InventoryListItemDto } from "@/features/inventory/contracts";
import {
  resolveIngredientBrandLabel,
  resolveIngredientCountry,
  resolveIngredientDisplayNames,
  resolveIngredientFermentableKindLabel
} from "@/features/ingredients/presentation";
import {
  formatConsumableFormLabel,
  formatConsumableUsageStageLabel
} from "@/features/ingredients/consumables";
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
  initialQuickStartDataByContext?: IngredientPickerQuickStartResultByContext | null;
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
      hop.alphaAcidPctTypical != null ? { label: `α ${formatValue(hop.alphaAcidPctTypical)}%` } : null,
      hopFormLabel ? { label: hopFormLabel } : null,
      item.source.harvestYear != null ? { label: `${item.source.harvestYear}` } : null
    ].filter((badge): badge is { label: string; accent?: InventoryBadgeAccent | null } => Boolean(badge));
  }

  if (technicalData.type === "malt" || technicalData.type === "fermentable") {
    const fermentable = technicalData as Extract<NonNullable<typeof technicalData>, { type: "malt" | "fermentable" }>;
    return [
      formatColorBadge(item)
        ? { label: formatColorBadge(item) ?? "", accent: resolveMaltColorBadgeAccent(item) }
        : null,
      fermentable.extractPctDryBasis != null ? { label: `Экстр. ${formatValue(fermentable.extractPctDryBasis)}%` } : null,
      fermentable.type === "malt" && fermentable.maxUsagePct != null
        ? { label: `до ${formatValue(fermentable.maxUsagePct)}%` }
        : fermentable.type === "fermentable" && fermentable.recommendedMaxPct != null
          ? { label: `до ${formatValue(fermentable.recommendedMaxPct)}%` }
          : null
    ].filter((badge): badge is { label: string; accent?: InventoryBadgeAccent | null } => Boolean(badge));
  }

  if (technicalData.type === "yeast") {
    const yeast = technicalData as Extract<NonNullable<typeof technicalData>, { type: "yeast" }>;
    return [
      yeast.form ? { label: yeast.form.replaceAll("_", " ") } : null,
      yeast.attenuationPctTypical != null ? { label: `Атт. ${formatValue(yeast.attenuationPctTypical)}%` } : null,
      yeast.fermentationTempCMin != null && yeast.fermentationTempCMax != null
        ? { label: `${formatValue(yeast.fermentationTempCMin)}–${formatValue(yeast.fermentationTempCMax)}°C` }
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
    const formLabel = formatConsumableFormLabel(consumable.commonForms?.[0]);
    const usageStageLabel = formatConsumableUsageStageLabel(consumable.usageStage?.[0]);
    return [
      formLabel ? { label: formLabel } : null,
      usageStageLabel ? { label: usageStageLabel } : null
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

  return badges.slice(0, 4);
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
    className="whitespace-nowrap text-sm font-semibold leading-none tracking-tight text-zinc-600"
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

export function InventoryListItem({
  item,
  preferredCurrency,
  currencyRates,
  initialQuickStartDataByContext = null
}: Props) {
  const badges = buildTechnicalBadges(item);
  const { primaryName, secondaryName } = resolveIngredientDisplayNames(item.source);
  const waterTreatmentTechnicalData = item.source.technicalData?.type === "water_treatment"
    ? item.source.technicalData as Extract<NonNullable<typeof item.source.technicalData>, { type: "water_treatment" }>
    : null;
  const titleFormula =
    waterTreatmentTechnicalData?.displayFormula?.trim() ??
    waterTreatmentTechnicalData?.formula?.trim() ??
    null;
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

  const statusBorderColor = isEmpty
    ? "border-zinc-200"
    : expired
      ? "border-red-200"
      : freshnessCritical
        ? "border-amber-200"
        : "border-zinc-200";

  const hasMetadata = Boolean(costSummary.totalPrice || costSummary.unitPrice || item.purchasedAt || item.freshnessDate);

  return (
    <li className={`group relative rounded-2xl border bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md sm:p-5 ${statusBorderColor} ${isEmpty ? "opacity-60" : ""}`}>
      {/* Top row: title + actions */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* Title line */}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            {titleFormula ? <FormulaLabel formula={titleFormula} /> : null}
            <h3 className="text-[15px] font-semibold leading-snug text-zinc-900">
              <Link href={detailHref} className="hover:text-zinc-600 transition-colors">
                {primaryName}
              </Link>
            </h3>
            {showFermentableKindInlineWithTitle ? (
              <span className="text-xs text-zinc-400">{fermentableKindLabel}</span>
            ) : null}
            {showInlineBrand ? (
              <span className="text-[13px] font-medium text-zinc-500">{brandLabel}</span>
            ) : null}
            {showCountryInlineWithTitle ? (
              <CountryFlag countryCode={country.code} className="h-3 w-4 self-center" />
            ) : null}
            {ownershipBadgeLabel ? (
              <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{ownershipBadgeLabel}</span>
            ) : null}
            {item.archivedAt ? (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                <Archive className="h-2.5 w-2.5" />
                Архив
              </span>
            ) : null}
          </div>

          {/* Subtitle + brand line */}
          {secondaryName ? (
            <p className="mt-0.5 text-xs text-zinc-400">{secondaryName}</p>
          ) : null}
          {!showInlineBrand && brandLabel ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-500">
              <span className="font-medium">{brandLabel}</span>
              {showCountryOnBrandLine ? (
                <CountryFlag countryCode={country.code} className="h-3 w-4" />
              ) : null}
              {showFermentableKindOnBrandLine ? (
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500">
                  {fermentableKindLabel}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Actions cluster */}
        <div className="flex shrink-0 items-center gap-0.5">
          {isEmpty ? (
            <span className="mr-1 text-xs font-medium text-rose-400">закончился</span>
          ) : (
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
          )}
          <InventoryItemDetailsEditor
            item={item}
            preferredCurrency={preferredCurrency}
            currencyRates={currencyRates}
            initialQuickStartDataByContext={initialQuickStartDataByContext}
            renderTrigger={(onClick) => (
              <button
                type="button"
                onClick={onClick}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
                aria-label="Редактировать"
              >
                <MoreHorizontal className="h-4 w-4" />
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
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
                aria-label="Удалить"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            )}
          />
        </div>
      </div>

      {/* Badges + quantity row */}
      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div className="min-w-0 space-y-2">
          {badges.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {badges.map((badge) => (
                <span
                  key={badge.key}
                  className={`relative inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                    badge.accent
                      ? "overflow-hidden bg-gradient-to-b from-zinc-50/95 to-zinc-100/90 text-zinc-700 ring-1 ring-zinc-200/70"
                      : "bg-zinc-100/80 text-zinc-500"
                  }`}
                >
                  {badge.label}
                  {badge.accent ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-[3px]"
                      style={{
                        backgroundImage: `linear-gradient(180deg, ${badge.accent.startHex} 0%, ${badge.accent.averageHex} 52%, ${badge.accent.endHex} 100%)`
                      }}
                    />
                  ) : null}
                </span>
              ))}
              <InventoryPurchaseLinksTrigger
                reference={{
                  source: item.source.sourceKind,
                  id: item.source.sourceId
                }}
                summary={item.source.purchaseLinks}
              />
            </div>
          ) : null}

          {hasMetadata ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
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
                <span className={`inline-flex items-center gap-1 ${expired ? "font-medium text-red-500" : freshnessCritical ? "font-medium text-amber-500" : ""}`}>
                  {expired || freshnessCritical ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                  {expired ? "Просрочен" : "до"} {item.freshnessDate.toLocaleDateString("ru-RU")}
                </span>
              ) : null}
            </div>
          ) : null}

          {item.notes ? (
            <p className="line-clamp-2 text-xs leading-relaxed text-zinc-400">{item.notes}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end">
          <InventoryQuantityEditor item={item} showFinishedAction={false} showEquivalentHint={false} />
        </div>
      </div>
    </li>
  );
}
