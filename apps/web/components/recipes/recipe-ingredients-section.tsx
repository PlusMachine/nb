import React from "react";
import { resolveIngredientCategory } from "@/features/ingredients/taxonomy";
import { formatInventoryQuantityForDisplay } from "@/features/inventory/display";
import type { RecipeDetailDto } from "@/features/recipes/contracts";

const stageLabel: Record<RecipeDetailDto["ingredients"][number]["stage"], string> = {
  mash: "Затирание",
  boil: "Кипячение",
  whirlpool: "Вирпул",
  fermentation: "Ферментация",
  packaging: "Розлив",
  other: "Другое"
};

const sectionOrder = ["fermentable", "hop", "yeast", "water_prep", "misc"] as const;
const sectionLabels = {
  fermentable: "Сбраживаемое",
  hop: "Хмель",
  yeast: "Дрожжи",
  water_prep: "Водоподготовка",
  misc: "Прочее"
} as const;

const buildMetaLine = (ingredient: RecipeDetailDto["ingredients"][number]) => {
  const stepMeta = (ingredient.stepMeta ?? {}) as Record<string, unknown>;
  const parts = [stageLabel[ingredient.stage]];

  if (typeof stepMeta.useType === "string") {
    parts.push(stepMeta.useType.replaceAll("_", " "));
  }
  if (typeof stepMeta.use === "string" && stepMeta.use !== "mash") {
    parts.push(stepMeta.use);
  }
  if (typeof stepMeta.timeMinutes === "number") {
    parts.push(`${stepMeta.timeMinutes} мин`);
  } else if (ingredient.timeOffset !== null) {
    parts.push(`${ingredient.timeOffset} мин`);
  }
  if (typeof stepMeta.temperatureC === "number") {
    parts.push(`${stepMeta.temperatureC} °C`);
  }
  if (typeof stepMeta.durationDays === "number") {
    parts.push(`${stepMeta.durationDays} дн`);
  }
  if (typeof stepMeta.fermentationTempC === "number") {
    parts.push(`${stepMeta.fermentationTempC} °C`);
  }
  if (typeof stepMeta.stageLabel === "string" && stepMeta.stageLabel.trim()) {
    parts.push(stepMeta.stageLabel.trim());
  }

  return parts.join(" • ");
};

export function RecipeIngredientsSection({ ingredients }: { ingredients: RecipeDetailDto["ingredients"] }) {
  const grouped = sectionOrder.map((category) => ({
    category,
    items: ingredients.filter((ingredient) => (ingredient.ingredientCategory ?? resolveIngredientCategory({ type: ingredient.type })) === category)
  }));

  return (
    <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="text-lg font-semibold">Ингредиенты</h2>
      {ingredients.length === 0 ? <p className="text-sm text-zinc-600">Ингредиенты пока не добавлены.</p> : null}
      <div className="space-y-4">
        {grouped.map((group) => group.items.length ? (
          <div key={group.category} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{sectionLabels[group.category]}</h3>
            <ul className="space-y-2">
              {group.items.map((ingredient) => (
                <li key={ingredient.id} className="rounded-md border border-zinc-100 p-3 text-sm">
                  <div className="font-medium text-zinc-900">{ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameSnapshot ?? ingredient.type}</div>
                  <div className="text-zinc-700">{formatInventoryQuantityForDisplay({
                    enteredQuantity: ingredient.amountEnteredQuantity,
                    enteredUnit: ingredient.amountEnteredUnit,
                    normalizedQuantity: ingredient.amountNormalizedQuantity,
                    normalizedUnit: ingredient.amountNormalizedUnit,
                    type: ingredient.type,
                    category: ingredient.ingredientCategory ?? resolveIngredientCategory({ type: ingredient.type }),
                    subtype: ingredient.ingredientSubtype ?? null,
                    defaultDisplayUnit: ingredient.ingredientDefaultDisplayUnit ?? ingredient.ingredientDefaultDisplayUnitSnapshot,
                    allowedUnits: ingredient.ingredientAllowedUnits ?? null,
                    measurementDimension: ingredient.ingredientMeasurementDimension ?? ingredient.ingredientMeasurementDimensionSnapshot ?? null
                  })}</div>
                  <div className="text-zinc-500">{buildMetaLine(ingredient)}</div>
                </li>
              ))}
            </ul>
          </div>
        ) : null)}
      </div>
    </section>
  );
}
