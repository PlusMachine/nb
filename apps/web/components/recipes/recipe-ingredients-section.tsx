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

export function RecipeIngredientsSection({ ingredients }: { ingredients: RecipeDetailDto["ingredients"] }) {
  return (
    <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="text-lg font-semibold">Ингредиенты</h2>
      {ingredients.length === 0 ? <p className="text-sm text-zinc-600">Ингредиенты пока не добавлены.</p> : null}
      <ul className="space-y-2">
        {ingredients.map((ingredient) => (
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
            <div className="text-zinc-500">Этап: {stageLabel[ingredient.stage]}</div>
            {ingredient.timeOffset !== null ? <div className="text-zinc-500">Смещение: {ingredient.timeOffset} мин</div> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
