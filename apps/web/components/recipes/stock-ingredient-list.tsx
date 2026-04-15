"use client";

import React, { useEffect, useState } from "react";

import {
  buildIngredientPickerTechnicalBadges,
  IngredientPickerInventoryMetaLine,
  IngredientPickerTechnicalBadges,
  resolveIngredientPickerRowContent,
  shouldSuppressIngredientPickerMetaSummary
} from "@/components/ingredients/ingredient-picker";
import { CountryFlagLabel } from "@/components/shared/country-flag";
import type { IngredientCategory, IngredientSubtype, IngredientSuggestionItem, IngredientType } from "@/features/ingredients/contracts";
import {
  resolveIngredientBrandLabel
} from "@/features/ingredients/presentation";

export type StockIngredientSearch = (input: {
  q: string;
  type?: IngredientType;
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  limit: number;
  signal: AbortSignal;
}) => Promise<IngredientSuggestionItem[]>;

export const stockIngredientListVisibleLimit = 12;

export function StockIngredientList({
  active,
  category,
  type,
  subtype,
  searchIngredients,
  onOverflowChange,
  onSelect
}: {
  active: boolean;
  category: IngredientCategory;
  type?: IngredientType;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  searchIngredients: StockIngredientSearch;
  onOverflowChange?: (hasOverflow: boolean) => void;
  onSelect: (item: IngredientSuggestionItem) => void;
}) {
  const [items, setItems] = useState<IngredientSuggestionItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active) {
      setItems([]);
      onOverflowChange?.(false);
      return undefined;
    }

    const controller = new AbortController();
    const run = async () => {
      try {
        setLoading(true);
        const result = await searchIngredients({
          q: "",
          type,
          category,
          subtype,
          limit: stockIngredientListVisibleLimit + 1,
          signal: controller.signal
        });
        if (!controller.signal.aborted) {
          setItems(result.slice(0, stockIngredientListVisibleLimit));
          onOverflowChange?.(result.length > stockIngredientListVisibleLimit);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setItems([]);
          onOverflowChange?.(false);
          console.error("Не удалось загрузить складские позиции для рецепта.", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      try {
        controller.abort("stock-ingredient-list-unmounted");
      } catch {
        // Older browser/runtime implementations can throw while aborting an already cancelled signal.
      }
    };
  }, [active, category, onOverflowChange, searchIngredients, subtype, type]);

  if (!active) return null;

  return (
    <div className="space-y-2 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-emerald-950">Подходящие позиции на складе</h4>
        {loading ? <span className="text-[11px] text-emerald-700">Загрузка...</span> : null}
      </div>
      {items.length ? (
        <div className="grid gap-1.5">
          {items.map((item) => {
            const { primaryName, secondaryName, inlineKindLabel, inlineBrand, country, subtitle, stockLabel } = resolveIngredientPickerRowContent(item);
            const brandLabel = resolveIngredientBrandLabel(item);
            const technicalBadges = buildIngredientPickerTechnicalBadges(item);
            const showSubtitle = shouldSuppressIngredientPickerMetaSummary(item, technicalBadges)
              ? null
              : subtitle;
            const ownershipBadgeLabel = item.source === "custom"
              ? item.derivedFromIngredientId
                ? "ИЗМЕНЕННЫЙ"
                : "СВОЙ"
              : null;
            return (
              <button
                key={`${item.inventoryItemId ?? item.id}:${item.source}`}
                type="button"
                onClick={() => onSelect(item)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-3 text-left text-xs text-zinc-700 transition-colors hover:border-emerald-200 hover:bg-emerald-50/60"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-zinc-950">{primaryName}</span>
                  {ownershipBadgeLabel ? (
                    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 ring-1 ring-amber-200">
                      {ownershipBadgeLabel}
                    </span>
                  ) : null}
                  {inlineBrand ? (
                    <span className="inline-flex min-w-0 items-baseline gap-2 text-sm font-semibold text-zinc-700">
                      <span aria-hidden="true" className="text-zinc-400">•</span>
                      <span className="truncate">{inlineBrand}</span>
                    </span>
                  ) : null}
                  {inlineKindLabel ? (
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-600 ring-1 ring-zinc-200">
                      {inlineKindLabel}
                    </span>
                  ) : null}
                </span>
                {secondaryName ? <span className="mt-0.5 block text-xs text-zinc-500">{secondaryName}</span> : null}
                <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                  {country ? (
                    <span className="inline-flex items-center rounded-full bg-white px-2 py-1 ring-1 ring-zinc-200">
                      <CountryFlagLabel
                        countryCode={country.code}
                        label={country.label}
                        iconClassName="h-3 w-4"
                        className="gap-1"
                      />
                    </span>
                  ) : null}
                  {inlineBrand || !brandLabel ? null : (
                    <span className="rounded-full bg-white px-2 py-1 ring-1 ring-zinc-200">{brandLabel}</span>
                  )}
                  {showSubtitle ? (
                    <span className="text-zinc-500">{showSubtitle}</span>
                  ) : null}
                </span>
                <IngredientPickerTechnicalBadges badges={technicalBadges} stockLabel={stockLabel} className="mt-1.5" />
                <IngredientPickerInventoryMetaLine item={item} className="mt-2" />
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-xs leading-5 text-emerald-900">
          {loading ? "Ищем позиции по категории." : "На складе нет подходящих позиций. Можно выбрать из каталога или создать свой ингредиент."}
        </p>
      )}
    </div>
  );
}
