import React from "react";
import type { InventoryListItemDto } from "@/features/inventory/contracts";
import { hopFormLabels, yeastFormLabels, yeastTypeLabels } from "@/features/ingredients/technical-fields";

import { InventoryItemDetailsEditor } from "./inventory-item-details-editor";
import { InventoryQuantityEditor } from "./inventory-quantity-editor";

type Props = {
  item: InventoryListItemDto;
};

const formatNumber = (value: number) => value.toLocaleString("ru-RU", {
  maximumFractionDigits: value % 1 === 0 ? 0 : 1
});

const buildTechnicalSummary = (item: InventoryListItemDto) => {
  const summary: string[] = [];

  if (item.source.manufacturer) {
    summary.push(`Производитель: ${item.source.manufacturer}`);
  }

  if (item.source.country) {
    summary.push(`Страна: ${item.source.country}`);
  }

  if (item.source.type === "fermentable") {
    if (item.source.fermentableColorEbc != null) {
      summary.push(`Цветность: ${formatNumber(item.source.fermentableColorEbc)} EBC`);
    }
    if (item.source.fermentableExtractYieldPct != null) {
      summary.push(`Экстрактивность: ${formatNumber(item.source.fermentableExtractYieldPct)}%`);
    }
  }

  if (item.source.type === "hop") {
    if (item.source.hopAlphaAcidPct != null) {
      summary.push(`Альфа-кислота: ${formatNumber(item.source.hopAlphaAcidPct)}%`);
    }
    if (item.source.hopForm) {
      summary.push(`Форма: ${hopFormLabels[item.source.hopForm]}`);
    }
    if (item.source.hopSeason) {
      summary.push(`Сезон: ${item.source.hopSeason}`);
    }
  }

  if (item.source.type === "yeast") {
    if (item.source.yeastAttenuationPct != null) {
      summary.push(`Сбраживание: ${formatNumber(item.source.yeastAttenuationPct)}%`);
    }
    if (item.source.yeastType) {
      summary.push(`Тип: ${yeastTypeLabels[item.source.yeastType]}`);
    }
    if (item.source.yeastForm) {
      summary.push(`Форма: ${yeastFormLabels[item.source.yeastForm]}`);
    }
    if (item.source.yeastMinFermentationTempC != null || item.source.yeastMaxFermentationTempC != null) {
      const min = item.source.yeastMinFermentationTempC != null ? formatNumber(item.source.yeastMinFermentationTempC) : "?";
      const max = item.source.yeastMaxFermentationTempC != null ? formatNumber(item.source.yeastMaxFermentationTempC) : "?";
      summary.push(`Температура брожения: ${min}-${max} °C`);
    }
  }

  return summary;
};

export function InventoryListItem({ item }: Props) {
  const technicalSummary = buildTechnicalSummary(item);

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
          <InventoryItemDetailsEditor item={item} />
        </div>
      </div>
      {item.notes ? <p className="mt-2 text-sm text-zinc-600">{item.notes}</p> : null}
    </li>
  );
}
