"use client";

import React from "react";
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
import type { InventoryListItemDto } from "@/features/inventory/contracts";
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

const buildTechnicalBadges = (item: InventoryListItemDto) => {
  const badges: string[] = [];

  if (item.source.manufacturer) {
    badges.push(item.source.manufacturer);
  }

  if (item.source.country) {
    badges.push(item.source.country);
  }

  if (item.source.summary) {
    badges.push(item.source.summary);
  }

  return badges;
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

  return (
    <li className={`relative rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
      isEmpty ? "border-zinc-200/60 opacity-60" : expired ? "border-red-200" : freshnessCritical ? "border-amber-200" : "border-zinc-200"
    }`}>
      <DeleteInventoryItemButton
        inventoryItemId={item.id}
        displayName={item.source.displayName}
        renderTrigger={(onClick, isPending) => (
          <button
            type="button"
            onClick={onClick}
            disabled={isPending}
            className="absolute right-2.5 top-2.5 rounded-md p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
            aria-label="Удалить"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      />

      <div className="flex items-start gap-4 pr-6">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-zinc-950">{item.source.displayName}</h3>
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
                <span key={badge} className="inline-flex items-center rounded-md bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600 ring-1 ring-zinc-200/60">
                  {badge}
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
              <span className={`inline-flex items-center gap-1 ${
                expired ? "font-medium text-red-600" : freshnessCritical ? "font-medium text-amber-600" : ""
              }`}>
                {expired || freshnessCritical ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                {expired ? "Просрочен" : "Годен до"} {item.freshnessDate.toLocaleDateString("ru-RU")}
              </span>
            ) : null}
          </div>

          {item.notes ? (
            <p className="text-sm leading-relaxed text-zinc-500">{item.notes}</p>
          ) : null}

          <InventoryItemDetailsEditor
            item={item}
            preferredCurrency={preferredCurrency}
            currencyRates={currencyRates}
            renderTrigger={(onClick) => (
              <button
                type="button"
                onClick={onClick}
                className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              >
                <Pencil className="h-3 w-3" />
                Редактировать
              </button>
            )}
          />
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <InventoryQuantityEditor item={item} />
        </div>
      </div>
    </li>
  );
}
