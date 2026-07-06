"use client";

import React, { useEffect, useState } from "react";
import { SliderScaffold } from "@nb/ui";

import {
  formatSliderRange,
  rangeSliderToParams,
  sliderValueFromParams,
  type RangeBound
} from "@/features/recipes/range-slider";

import { useRecipeQueryNav } from "./use-recipe-query";

/**
 * Диапазонный слайдер (ABV/IBU) поверх `SliderScaffold`. Значение читается из URL
 * (`minKey`/`maxKey`); drag обновляет локальную подпись, запись в URL — по
 * отпусканию (`onValueCommit`, режим replace, чтобы не плодить историю). Границы
 * диапазона = «нет фильтра» (см. `rangeSliderToParams`).
 */
export function RecipesRangeSlider({
  label,
  unit,
  minKey,
  maxKey,
  bound
}: {
  label: string;
  unit?: string;
  minKey: string;
  maxKey: string;
  bound: RangeBound;
}) {
  const { searchParams, navigate } = useRecipeQueryNav();
  const urlValue = sliderValueFromParams(searchParams.get(minKey), searchParams.get(maxKey), bound);
  const [value, setValue] = useState<[number, number]>(urlValue);

  // Синхронизация с внешними изменениями URL (сброс фильтров, удаление чипа).
  useEffect(() => {
    setValue(urlValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlValue[0], urlValue[1]]);

  const commit = (next: number[]) => {
    const pair: [number, number] = [next[0], next[1]];
    const { min, max } = rangeSliderToParams(pair, bound);
    navigate({ [minKey]: min, [maxKey]: max }, undefined, "replace");
  };

  return (
    <fieldset className="space-y-2.5">
      <legend className="flex w-full items-center justify-between text-sm font-semibold text-foreground">
        <span>
          {label}
          {unit ? <span className="ml-1 font-normal text-muted-foreground">{unit}</span> : null}
        </span>
        <span className="font-normal tabular-nums text-muted-foreground">
          {formatSliderRange(value, bound, unit)}
        </span>
      </legend>
      <SliderScaffold
        value={value}
        min={bound.min}
        max={bound.max}
        step={bound.step}
        ariaLabel={label}
        thumbLabels={[`${label}: минимум`, `${label}: максимум`]}
        onValueChange={(next) => setValue([next[0], next[1]])}
        onValueCommit={commit}
      />
    </fieldset>
  );
}
