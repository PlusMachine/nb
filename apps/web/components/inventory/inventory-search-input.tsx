"use client";

import React from "react";
import { useEffect, useRef, useState } from "react";

import { IngredientPicker } from "@/components/ingredients/ingredient-picker";
import type { IngredientSuggestionItem, IngredientType } from "@/features/ingredients/contracts";

type Props = {
  defaultValue: string;
  type: IngredientType | "all";
  archived: boolean;
};

const buildInventorySuggestionParams = ({
  archived,
  q,
  type,
  limit
}: {
  archived: boolean;
  q: string;
  type?: IngredientType;
  limit: number;
}) => {
  const params = new URLSearchParams({ q: q.trim(), limit: String(limit) });
  if (type) {
    params.set("type", type);
  }
  if (archived) {
    params.set("archived", "true");
  }

  return params;
};

export function InventorySearchInput({ defaultValue, type, archived }: Props) {
  const [value, setValue] = useState(defaultValue);
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  const effectiveType = type === "all" ? undefined : type;

  const submitSelectedSuggestion = (item: IngredientSuggestionItem) => {
    const nextValue = item.displayName;
    setValue(nextValue);

    const hiddenInput = hiddenInputRef.current;
    if (!hiddenInput) {
      return;
    }

    hiddenInput.value = nextValue;
    requestAnimationFrame(() => {
      hiddenInput.form?.requestSubmit();
    });
  };

  return (
    <label className="flex-1 text-sm font-medium">
      <span>Поиск</span>
      <input ref={hiddenInputRef} id="inventory-search" name="search" type="hidden" value={value} readOnly />
      <div className="mt-1">
        <IngredientPicker
          value={value}
          type={effectiveType}
          onValueChange={setValue}
          onSelect={submitSelectedSuggestion}
          placeholder="Например, Citra или Пилснер"
          emptyCta={<p className="text-xs text-zinc-500">В ваших запасах ничего не найдено. Можно ввести произвольный текст и нажать «Применить».</p>}
          searchIngredients={async ({ q, type: nextType, limit, signal }) => {
            const params = buildInventorySuggestionParams({ archived, q, type: nextType, limit });
            const response = await fetch(`/api/inventory/suggestions?${params.toString()}`, { signal });
            if (!response.ok) {
              return [];
            }

            const data = await response.json() as { items: IngredientSuggestionItem[] };
            return data.items;
          }}
        />
      </div>
    </label>
  );
}
