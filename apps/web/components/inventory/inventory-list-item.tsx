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
  resolveIngredientDisplayNames
} from "@/features/ingredients/presentation";
import { buildInventoryCostDisplay } from "@/features/inventory/display";
import type { SystemCurrency, SystemCurrencyRateMap } from "@/features/system/currency";

import { DeleteInventoryItemButton } from "./delete-inventory-item-button";
import { InventoryItemDetailsEditor } from "./inventory-item-details-editor";
import { InventoryQuantityEditor } from "./inventory-quantity-editor";

type Props = {
  item: InventoryListItemDto;
  preferredCurrency: SystemCurrency;
  currencyRates: SystemCurrencyRateMap;
};

const formatValue = (value: number) => (
  value % 1 === 0 ? String(value) : value.toFixed(1).replace(/\.0$/, "")
);

const formatColorBadge = (item: InventoryListItemDto) => {
  const technicalData = item.source.technicalData;
  if (!technicalData || (technicalData.type !== "malt" && technicalData.type !== "fermentable")) {
    return null;
  }

  if (technicalData.type === "malt") {
    const malt = technicalData as Extract<NonNullable<typeof technicalData>, { type: "malt" }>;
    if (malt.colorEbcMin != null && malt.colorEbcMax != null) {
      return malt.colorEbcMin === malt.colorEbcMax
        ? `${formatValue(malt.colorEbcMin)} EBC`
        : `${formatValue(malt.colorEbcMin)}-${formatValue(malt.colorEbcMax)} EBC`;
    }

    if (malt.colorEbcMin != null) {
      return `${formatValue(malt.colorEbcMin)} EBC`;
    }

    if (malt.colorEbcMax != null) {
      return `${formatValue(malt.colorEbcMax)} EBC`;
    }
  }

  const fermentable = technicalData as Extract<NonNullable<typeof technicalData>, { type: "malt" | "fermentable" }>;
  if (fermentable.colorLovibond != null) {
    const ebc = fermentable.colorLovibond * 1.97;
    return `~${formatValue(ebc)} EBC`;
  }

  return null;
};

type InventoryBadge = {
  key: string;
  label: string;
};

const buildTypedBadges = (item: InventoryListItemDto) => {
  const technicalData = item.source.technicalData;
  if (!technicalData) {
    return [];
  }

  if (technicalData.type === "hop") {
    const hop = technicalData as Extract<NonNullable<typeof technicalData>, { type: "hop" }>;
    return [
      hop.alphaAcidPctTypical != null ? `Альфа ${formatValue(hop.alphaAcidPctTypical)}%` : null,
      hop.hopForm ? hop.hopForm.replaceAll("_", " ") : null,
      item.source.harvestYear != null ? `Урожай ${item.source.harvestYear}` : null
    ].filter((badge): badge is string => Boolean(badge));
  }

  if (technicalData.type === "malt" || technicalData.type === "fermentable") {
    const fermentable = technicalData as Extract<NonNullable<typeof technicalData>, { type: "malt" | "fermentable" }>;
    return [
      formatColorBadge(item),
      fermentable.extractPctDryBasis != null ? `Экстракт ${formatValue(fermentable.extractPctDryBasis)}%` : null,
      fermentable.type === "malt" && fermentable.maxUsagePct != null
        ? `До ${formatValue(fermentable.maxUsagePct)}%`
        : fermentable.type === "fermentable" && fermentable.recommendedMaxPct != null
          ? `До ${formatValue(fermentable.recommendedMaxPct)}%`
          : null
    ].filter((badge): badge is string => Boolean(badge));
  }

  if (technicalData.type === "yeast") {
    const yeast = technicalData as Extract<NonNullable<typeof technicalData>, { type: "yeast" }>;
    return [
      yeast.form ? yeast.form.replaceAll("_", " ") : null,
      yeast.attenuationPctTypical != null ? `Атт. ${formatValue(yeast.attenuationPctTypical)}%` : null,
      yeast.fermentationTempCMin != null && yeast.fermentationTempCMax != null
        ? `${formatValue(yeast.fermentationTempCMin)}-${formatValue(yeast.fermentationTempCMax)}°C`
        : null
    ].filter((badge): badge is string => Boolean(badge));
  }

  if (technicalData.type === "water_treatment") {
    const waterTreatment = technicalData as Extract<NonNullable<typeof technicalData>, { type: "water_treatment" }>;
    return [
      waterTreatment.unitPreferred ?? null,
      waterTreatment.waterCalcRole?.[0]?.replaceAll("_", " ") ?? null
    ].filter((badge): badge is string => Boolean(badge));
  }

  if (technicalData.type === "consumable") {
    const consumable = technicalData as Extract<NonNullable<typeof technicalData>, { type: "consumable" }>;
    return [
      consumable.commonForms?.[0]?.replaceAll("_", " ") ?? null,
      consumable.usageStage?.[0]?.replaceAll("_", " ") ?? null
    ].filter((badge): badge is string => Boolean(badge));
  }

  return [];
};

const buildTechnicalBadges = (item: InventoryListItemDto) => {
  const badges: InventoryBadge[] = [];
  const seen = new Set<string>();

  const pushTextBadge = (label?: string | null) => {
    const trimmed = label?.trim();
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
      label: trimmed
    });
  };

  for (const badge of buildTypedBadges(item)) {
    pushTextBadge(badge);
  }

  if (item.source.summary && badges.length < 3) {
    pushTextBadge(item.source.summary);
  }

  return badges.slice(0, 5);
};

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
  const brandLabel = resolveIngredientBrandLabel(item.source);
  const country = resolveIngredientCountry(item.source);
  const showInlineBrand = Boolean(
    brandLabel && (item.source.subtype === "malt" || item.source.category === "fermentable")
  );
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
              className="inline-flex items-center rounded-lg border border-slate-300 bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:border-slate-700 hover:bg-slate-800 disabled:opacity-60"
            >
              {isPending ? "..." : "Закончился"}
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
              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
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
              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
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
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-zinc-950">
                  <Link href={detailHref} className="underline-offset-4 hover:underline">
                    {primaryName}
                  </Link>
                </h3>
                {showInlineBrand ? (
                  <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-zinc-700">
                    <span aria-hidden="true" className="text-zinc-400">•</span>
                    <span className="truncate">{brandLabel}</span>
                  </span>
                ) : null}
                {country ? (
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
                </div>
              ) : null}
            </div>
            {item.source.sourceKind === "custom" ? (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">Свой</span>
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
                <span key={badge.key} className="inline-flex items-center rounded-md bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600 ring-1 ring-zinc-200/60">
                  {badge.label}
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
