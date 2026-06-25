import React from "react";

import {
  beerColorFromSrm,
  NEUTRAL_SOFT_GRADIENT,
  pickTextColorForSrm,
  srmToSoftGradient
} from "@/features/recipes/beer-color";

/**
 * Серверный свотч цвета пива по SRM — обложка карточки, когда у рецепта нет ни
 * своего фото, ни фото BJCP-стиля. Цвет НИКОГДА не единственный сигнал:
 * дублируется числом `SRM N` и названием оттенка (a11y, §6 ТЗ).
 *
 * - `variant="fill"` (по умолчанию) — мягкая цветовая заливка-градиент по SRM.
 * - `variant="overlay"` — прозрачная подпись поверх размытого фото BJCP-стиля.
 */
export function RecipeColorSwatch({
  srm,
  className,
  variant = "fill"
}: {
  srm: number | null;
  className?: string;
  variant?: "fill" | "overlay";
}) {
  const hasColor = srm != null && Number.isFinite(srm);
  const label = hasColor ? beerColorFromSrm(srm).label : "Цвет не указан";
  const srmText = hasColor ? `SRM ${srm.toFixed(1).replace(/\.0$/, "")}` : "SRM —";

  if (variant === "overlay") {
    return (
      <div
        className={`pointer-events-none flex items-end justify-between gap-2 px-3 pb-2 text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.55)] ${className ?? ""}`}
      >
        <span className="text-xs font-semibold tabular-nums">{srmText}</span>
        <span className="truncate text-[11px] font-medium opacity-95">{label}</span>
      </div>
    );
  }

  const background = hasColor ? srmToSoftGradient(srm) : NEUTRAL_SOFT_GRADIENT;
  const textColor = hasColor ? pickTextColorForSrm(srm) : "#57534e";

  return (
    <div
      className={`flex items-center justify-between gap-2 px-3 ${className ?? ""}`}
      style={{ backgroundImage: background, color: textColor }}
    >
      <span className="text-xs font-semibold tabular-nums">{srmText}</span>
      <span className="truncate text-[11px] font-medium opacity-90">{label}</span>
    </div>
  );
}
