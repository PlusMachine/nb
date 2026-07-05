import React from "react";

import type { IngredientTechnicalData } from "@/features/ingredients/contracts";
import { resolveIngredientTechnicalDataColorRangeEbc } from "@/features/ingredients/technical-fields";
import { beerColorFromSrm } from "@/features/recipes/beer-color";

// Коэффициент Morey/BeerXML, использующийся во всём каталоге ингредиентов
// для перевода EBC в SRM (SRM = EBC / 1.97).
const ebcToSrm = (value: number) => value / 1.97;

export type IngredientColorAccent = {
  startHex: string;
  averageHex: string;
  endHex: string;
};

/**
 * Цветовой акцент солода/сброженного сырья: начало-среднее-конец диапазона
 * EBC → SRM → hex. Раньше эта логика (ebcToSrm + beerColorFromSrm) была
 * продублирована в бейджах склада, пикера и карточки рецепта — теперь общая точка входа.
 */
export const resolveIngredientColorAccent = (
  technicalData: IngredientTechnicalData | null | undefined
): IngredientColorAccent | null => {
  const range = resolveIngredientTechnicalDataColorRangeEbc(technicalData);
  if (!range) {
    return null;
  }

  const start = beerColorFromSrm(ebcToSrm(range.min));
  const average = beerColorFromSrm(ebcToSrm(range.average));
  const end = beerColorFromSrm(ebcToSrm(range.max));

  return {
    startHex: start.hex,
    averageHex: average.hex,
    endHex: end.hex
  };
};

const accentGradient = (accent: IngredientColorAccent) => (
  `linear-gradient(180deg, ${accent.startHex} 0%, ${accent.averageHex} 52%, ${accent.endHex} 100%)`
);

/**
 * Акцентная полоса слева в технической плашке (склад/пикер/карточка рецепта) —
 * тот же вид, что был захардкожен в трёх местах по отдельности.
 */
export function IngredientColorAccentStripe({
  accent,
  widthClassName = "w-[4px]"
}: {
  accent: IngredientColorAccent;
  widthClassName?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`absolute inset-y-0 left-0 ${widthClassName}`}
      style={{ backgroundImage: accentGradient(accent) }}
    />
  );
}

/** Цветной кружок EBC для строк каталога — рядом со значением цвета солода/сырья. */
export function IngredientColorSwatch({
  accent,
  className = "h-3 w-3"
}: {
  accent: IngredientColorAccent;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full ring-1 ring-black/10 ${className}`}
      style={{ backgroundImage: accentGradient(accent) }}
    />
  );
}
