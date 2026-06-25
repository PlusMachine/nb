"use client";

import React from "react";

import { srmColorBands, srmToHex } from "@/features/recipes/beer-color";

import { useRecipeQueryNav } from "./use-recipe-query";

/** Цвет-заливка сегмента — реальный оттенок пива по середине SRM-бэнда. */
const bandFill = (min: number, max: number): string => srmToHex((min + max) / 2);

/**
 * Фильтр цвета пива — кликабельная градиентная шкала реальных оттенков (вместо
 * серых чипов). 7 сегментов `srmColorBands`; тап ставит/снимает
 * `colorMin`/`colorMax` (контракт URL не меняется). Цвет не единственный сигнал:
 * у каждого сегмента `aria-label` с названием оттенка и SRM, а выбранный бэнд
 * продублирован подписью снизу (§6 ТЗ, a11y).
 */
export function RecipesColorScale() {
  const { searchParams, navigate } = useRecipeQueryNav();
  const colorMin = searchParams.get("colorMin");
  const colorMax = searchParams.get("colorMax");
  const activeBand = srmColorBands.find(
    (band) => colorMin === String(band.min) && colorMax === String(band.max)
  );

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-zinc-950">Цвет пива</legend>
      <div className="flex overflow-hidden rounded-xl border border-zinc-200">
        {srmColorBands.map((band) => {
          const active = activeBand?.id === band.id;
          const label = `${band.label}, SRM ${band.min}–${band.max}`;
          return (
            <button
              key={band.id}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={active}
              onClick={() =>
                navigate(
                  active
                    ? { colorMin: null, colorMax: null }
                    : { colorMin: String(band.min), colorMax: String(band.max) }
                )
              }
              className={`relative h-9 flex-1 transition focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                active ? "z-10 ring-2 ring-inset ring-zinc-950" : "hover:opacity-90"
              }`}
              style={{ backgroundColor: bandFill(band.min, band.max) }}
            >
              <span className="sr-only">{label}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-zinc-500" aria-live="polite">
        {activeBand ? (
          <>
            <span className="font-medium text-zinc-700">{activeBand.label}</span>
            {" · "}
            <span className="tabular-nums">
              SRM {activeBand.min}–{activeBand.max}
            </span>
          </>
        ) : (
          "Любой цвет"
        )}
      </p>
    </fieldset>
  );
}
