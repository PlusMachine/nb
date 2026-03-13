import React from "react";
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

const buildTechnicalSummary = (item: InventoryListItemDto) => {
  const summary: string[] = [];

  if (item.source.manufacturer) {
    summary.push(`Производитель: ${item.source.manufacturer}`);
  }

  if (item.source.country) {
    summary.push(`Страна: ${item.source.country}`);
  }

  if (item.source.summary) {
    summary.push(item.source.summary);
  }

  return summary;
};

export function InventoryListItem({ item, preferredCurrency, currencyRates }: Props) {
  const technicalSummary = buildTechnicalSummary(item);
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

  return (
    <li className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{item.source.displayName}</p>
          <p className="text-xs text-zinc-500">Источник: {item.source.sourceKind === "catalog" ? "Каталог" : "Пользовательский"}</p>
          {technicalSummary.length ? (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-600">
              {technicalSummary.map((line) => (
                <span key={line} className="rounded-full bg-zinc-100 px-2 py-1">
                  {line}
                </span>
              ))}
            </div>
          ) : null}
          {item.archivedAt ? <p className="text-xs text-amber-700">Архивный ингредиент</p> : null}
          {item.purchasedAt ? <p className="text-xs text-zinc-500">Дата покупки: {item.purchasedAt.toLocaleDateString("ru-RU")}</p> : null}
          {item.freshnessDate ? <p className="text-xs text-zinc-500">Годен до: {item.freshnessDate.toLocaleDateString("ru-RU")}</p> : null}
        </div>
        <div className="space-y-2">
          <InventoryQuantityEditor item={item} />
          <InventoryItemDetailsEditor item={item} preferredCurrency={preferredCurrency} currencyRates={currencyRates} />
          <DeleteInventoryItemButton inventoryItemId={item.id} displayName={item.source.displayName} />
        </div>
      </div>
      {costSummary.totalPrice ? <p className="text-sm text-zinc-700">Цена покупки: {costSummary.totalPrice}</p> : null}
      {costSummary.unitPrice ? <p className="text-sm text-zinc-700">Цена за единицу: {costSummary.unitPrice}</p> : null}
      {item.notes ? <p className="mt-2 text-sm text-zinc-600">{item.notes}</p> : null}
    </li>
  );
}
