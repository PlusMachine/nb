import React from "react";

import { srmToHex } from "@/features/recipes/beer-color";

/**
 * Тонкая горизонтальная полоса-градиент в цвете самого рецепта — как шапка
 * карточки «Стили пива BJCP» на главной (та полоса по всей SRM-шкале). Здесь
 * берём срез шкалы вокруг фактического SRM рецепта: слева светлее (как верх
 * бокала на свету), справа глубже. Оттенки — из той же палитры `srmToHex`, что и
 * весь сайт, а не отдельные хексы.
 */
function srmStripGradient(srm: number): string {
  const c1 = srmToHex(Math.max(1.2, srm * 0.5));
  const c2 = srmToHex(Math.max(1.5, srm * 0.75));
  const c3 = srmToHex(srm);
  const c4 = `color-mix(in srgb, ${c3} 72%, black)`;
  return `linear-gradient(90deg, ${c1} 0%, ${c2} 34%, ${c3} 72%, ${c4} 100%)`;
}

/**
 * Шапка публичного рецепта с верхней полосой в цвете пива по SRM.
 */
export function RecipeHeaderShell({
  colorSrm,
  children
}: {
  colorSrm: number | null;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border pb-5">
      {colorSrm != null ? (
        <div aria-hidden className="h-1.5 w-full rounded-full" style={{ background: srmStripGradient(colorSrm) }} />
      ) : null}
      <div className={colorSrm != null ? "pt-4" : undefined}>{children}</div>
    </section>
  );
}
