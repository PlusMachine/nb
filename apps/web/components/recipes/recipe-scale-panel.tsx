"use client";

import React, { useMemo, useState } from "react";

import type { RecipeDetailDto } from "@/features/recipes/contracts";
import { scaleRecipeToVolume } from "@/features/recipes/scale";

const litresFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const factorFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const amountFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });

/**
 * Эфемерный пересчёт рецепта под объём пользователя. Меняет ТОЛЬКО отображаемые
 * количества — без записи в БД и без создания копии (чистая `scaleRecipeToVolume`).
 * Только на публичной детальной странице рецепта.
 */
export function RecipeScalePanel({ recipe }: { recipe: RecipeDetailDto }) {
  const baseBatchLitres = useMemo(() => scaleRecipeToVolume(recipe, Number.NaN).baseBatchLitres, [recipe]);
  const [input, setInput] = useState<string>(() => (baseBatchLitres > 0 ? String(baseBatchLitres) : ""));

  const target = Number(input.replace(",", "."));
  const view = useMemo(() => scaleRecipeToVolume(recipe, target), [recipe, target]);

  if (recipe.ingredients.length === 0 || baseBatchLitres <= 0) {
    return null;
  }

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-900">Пересчитать под объём</h2>
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <span>Объём, л</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.5}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="w-24 rounded-lg border border-zinc-200 px-2 py-1 text-right tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
            aria-label="Целевой объём партии, литры"
          />
        </label>
      </div>

      <p className="text-xs text-zinc-500">
        {view.scaled
          ? `Количества под ${litresFormatter.format(view.targetBatchLitres)} л (×${factorFormatter.format(view.factor)}). `
          : `Базовый объём рецепта — ${litresFormatter.format(view.baseBatchLitres)} л. `}
        Не меняет оригинал; чтобы сохранить изменения — клонируйте рецепт.
      </p>

      <ul className="space-y-1">
        {view.ingredients.map((ingredient) => (
          <li key={ingredient.persistentKey} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-zinc-700">{ingredient.displayName ?? "—"}</span>
            <span className="shrink-0 font-medium tabular-nums text-zinc-900">
              {amountFormatter.format(ingredient.amountEnteredQuantity)} {ingredient.amountEnteredUnit}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
