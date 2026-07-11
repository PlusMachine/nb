"use client";

import { Droplets, FlaskConical, Hop, Package, Wheat } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";

import { type IngredientCategory } from "@/features/ingredients/contracts";
import {
  buildIngredientPickerQuickStartGroupsFromRecentSelections,
  ingredientPickerQuickStartRecentStorageKey,
  sanitizeIngredientPickerStoredRecentSelections,
  type IngredientPickerStoredRecentSelection
} from "@/features/ingredients/picker-quick-start";

import { isRecipeFermentableGroupScope, type RecipeFermentablePickerScope } from "./helpers";

const recipeIngredientCategoryOptions: Array<{
  value: IngredientCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClassName: string;
}> = [
    { value: "fermentable", label: "Сбраживаемое", icon: Wheat, iconClassName: "text-amber-600 dark:text-amber-400" },
    { value: "hop", label: "Хмель", icon: Hop, iconClassName: "text-emerald-600 dark:text-emerald-400" },
    { value: "yeast", label: "Дрожжи", icon: FlaskConical, iconClassName: "text-violet-600 dark:text-violet-400" },
    { value: "water_treatment", label: "Водоподготовка", icon: Droplets, iconClassName: "text-sky-600 dark:text-sky-400" },
    { value: "consumable", label: "Специи и добавки", icon: Package, iconClassName: "text-muted-foreground" }
  ];

export function RecipeIngredientCategoryGrid({
  value,
  onChange,
  legend = "Категория ингредиента",
  testId
}: {
  value: IngredientCategory;
  onChange: (value: IngredientCategory) => void;
  legend?: string;
  testId?: string;
}) {
  return (
    <fieldset className="space-y-2" data-testid={testId}>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {recipeIngredientCategoryOptions.map((option) => {
          const Icon = option.icon;

          return (
            <button
              key={option.value}
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                onChange(option.value);
              }}
              onClick={(event) => {
                if (event.detail !== 0) {
                  return;
                }

                onChange(option.value);
              }}
              className={`rounded-md border px-3 py-2 text-xs transition ${value === option.value
                ? "border-foreground bg-accent text-foreground"
                : "border-border bg-card text-muted-foreground hover:border-border hover:bg-muted"
                }`}
            >
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${value === option.value ? "text-current" : option.iconClassName}`} />
                <span>{option.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function RecipeFermentableScopePicker({
  value,
  onChange
}: {
  value: RecipeFermentablePickerScope | null;
  onChange: (value: RecipeFermentablePickerScope | null) => void;
}) {
  const [recentSelections, setRecentSelections] = useState<IngredientPickerStoredRecentSelection[]>([]);
  const options = useMemo<Array<{ value: RecipeFermentablePickerScope; label: string }>>(() => {
    const orderedGroups: Array<{
      value: Exclude<RecipeFermentablePickerScope, "malt">;
      label: string;
    }> = buildIngredientPickerQuickStartGroupsFromRecentSelections({
      selections: recentSelections,
      category: "fermentable",
      subtype: "fermentable"
    })
      .flatMap((group) => (
        isRecipeFermentableGroupScope(group.value)
          ? [{
            value: group.value,
            label: group.label
          }]
          : []
      ));

    return [
      { value: "malt", label: "Солод" },
      ...orderedGroups
    ];
  }, [recentSelections]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(ingredientPickerQuickStartRecentStorageKey);
      if (!raw) {
        setRecentSelections([]);
        return;
      }

      setRecentSelections(sanitizeIngredientPickerStoredRecentSelections(JSON.parse(raw)));
    } catch {
      setRecentSelections([]);
    }
  }, []);

  return (
    <div className="space-y-2" data-testid="recipe-fermentable-scope-picker">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        По типу сбраживаемого
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(active ? null : option.value)}
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-foreground hover:border-border hover:bg-muted"
                }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
