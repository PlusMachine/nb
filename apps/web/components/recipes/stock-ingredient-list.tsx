"use client";

import React, { useEffect, useState } from "react";

import {
  buildIngredientPickerTechnicalBadges,
  IngredientPickerInventoryMetaLine,
  IngredientPickerTechnicalBadges,
  resolveIngredientPickerRowContent,
  shouldSuppressIngredientPickerMetaSummary
} from "@/components/ingredients/ingredient-picker";
import { CountryFlag } from "@/components/shared/country-flag";
import type { IngredientCategory, IngredientSubtype, IngredientSuggestionItem, IngredientType } from "@/features/ingredients/contracts";
import {
  resolveIngredientBrandLabel
} from "@/features/ingredients/presentation";

export type StockIngredientSearch = (input: {
  q: string;
  type?: IngredientType;
  category?: IngredientCategory;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  group?: string;
  limit: number;
  signal: AbortSignal;
}) => Promise<IngredientSuggestionItem[]>;

export const stockIngredientListVisibleLimit = 12;

export function StockIngredientList({
  active,
  category,
  type,
  subtype,
  group,
  searchIngredients,
  onOverflowChange,
  onSelect
}: {
  active: boolean;
  category: IngredientCategory;
  type?: IngredientType;
  subtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  group?: string;
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
          group,
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
  }, [active, category, group, onOverflowChange, searchIngredients, subtype, type]);

  if (!active) return null;

  return (
    <div className="space-y-2">
      {loading ? <div className="text-[11px] text-muted-foreground">Загрузка...</div> : null}
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
                className="rounded-lg border border-border bg-card px-3 py-3 text-left text-xs text-foreground transition-colors hover:border-border hover:bg-muted"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">{primaryName}</span>
                  {ownershipBadgeLabel ? (
                    <span className="shrink-0 rounded-full bg-warning-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-warning-subtle-foreground ring-1 ring-warning/30">
                      {ownershipBadgeLabel}
                    </span>
                  ) : null}
                  {inlineBrand ? (
                    <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                      <span aria-hidden="true" className="text-muted-foreground">•</span>
                      <span className="truncate">{inlineBrand}</span>
                      {country ? (
                        <CountryFlag
                          countryCode={country.code}
                          className="h-3 w-4 shrink-0 ring-0"
                        />
                      ) : null}
                    </span>
                  ) : null}
                  {inlineKindLabel ? (
                    <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border">
                      {inlineKindLabel}
                    </span>
                  ) : null}
                </span>
                {secondaryName ? <span className="mt-0.5 block text-xs text-muted-foreground">{secondaryName}</span> : null}
                <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {inlineBrand || !brandLabel ? null : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2 py-1 ring-1 ring-border">
                      <span>{brandLabel}</span>
                      {country ? (
                        <CountryFlag
                          countryCode={country.code}
                          className="h-3 w-4 shrink-0 ring-0"
                        />
                      ) : null}
                    </span>
                  )}
                  {brandLabel || !country ? null : (
                    <span className="inline-flex items-center rounded-full bg-card px-2 py-1 ring-1 ring-border">
                      <CountryFlag
                        countryCode={country.code}
                        className="h-3 w-4 shrink-0 ring-0"
                      />
                    </span>
                  )}
                  {showSubtitle ? (
                    <span className="text-muted-foreground">{showSubtitle}</span>
                  ) : null}
                </span>
                <IngredientPickerTechnicalBadges badges={technicalBadges} stockLabel={stockLabel} className="mt-1.5" />
                <IngredientPickerInventoryMetaLine item={item} className="mt-2" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
