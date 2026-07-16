import React from "react";

import { srmToHex } from "@/features/recipes/beer-color";

/**
 * «Стеклянный» градиент от цвета пива для фона шапки публичного рецепта. Чтобы не
 * выглядеть одноцветной тонировкой, оттенки берём не смешиванием одного hex с
 * белым/чёрным, а срезом самой SRM-шкалы — как свет проходит через бокал: верх
 * заметно светлее и желтее (низкий SRM), середина — фактический цвет, низ —
 * глубже и краснее. Сверху — мягкое «пенное» свечение.
 */
function srmMeshGradient(srm: number): string {
  const glow = srmToHex(Math.max(1, srm * 0.3)); // «верх бокала» — светлее и с уходом в жёлтое
  const light = srmToHex(Math.max(1.5, srm * 0.6));
  const base = srmToHex(srm);
  const deep = `color-mix(in srgb, ${base} 62%, black)`;
  return [
    "radial-gradient(55% 65% at 12% -12%, rgba(255,252,240,0.55) 0%, transparent 60%)",
    `radial-gradient(85% 130% at 80% -18%, ${glow} 0%, transparent 52%)`,
    `radial-gradient(75% 110% at 50% 28%, ${light} 0%, transparent 62%)`,
    `radial-gradient(120% 150% at 4% 112%, ${deep} 0%, transparent 66%)`,
    `linear-gradient(115deg, ${light} 0%, ${base} 48%, ${deep} 100%)`
  ].join(", ");
}

/** Блик-«стекло»: диагональная световая полоса поверх градиента. */
const GLASS_SHEEN =
  "linear-gradient(105deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.1) 38%, transparent 55%, rgba(255,255,255,0.08) 82%, transparent 100%)";

/**
 * Обёртка шапки публичного рецепта. Когда у рецепта известен цвет (SRM), шапка
 * становится «стеклом» поверх цветовой полосы {@link RecipeColorBand}; иначе —
 * обычная карточка (полоса тоже не рендерится).
 */
export function RecipeHeaderShell({
  colorSrm,
  children
}: {
  colorSrm: number | null;
  children: React.ReactNode;
}) {
  if (colorSrm == null) {
    return <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">{children}</section>;
  }

  return (
    <section className="relative rounded-2xl border border-border bg-card/70 p-5 shadow-sm backdrop-blur-md">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px rounded-t-2xl bg-white/45 dark:bg-white/15" />
      {children}
    </section>
  );
}

/**
 * Цветовая полоса от цвета пива за верхом страницы рецепта (хлебные крошки +
 * шапка + начало контента), растворяется вниз в фон страницы. Полоса full-bleed —
 * выходит за контейнер контента на всю ширину окна. Ничего не рендерит, если цвет
 * рецепта неизвестен.
 */
export function RecipeColorBand({ colorSrm }: { colorSrm: number | null }) {
  if (colorSrm == null) {
    return null;
  }

  return (
    <div aria-hidden className="absolute left-1/2 top-0 -z-10 h-[420px] w-screen -translate-x-1/2 overflow-hidden">
      <div className="absolute inset-0 opacity-50 dark:opacity-35" style={{ background: srmMeshGradient(colorSrm) }} />
      <div className="absolute inset-0 opacity-70 dark:opacity-25" style={{ background: GLASS_SHEEN }} />
      <div className="absolute inset-0 bg-gradient-to-b from-background/25 via-background/55 to-background" />
    </div>
  );
}
