import React from "react";
import { CircleAlert, CircleCheck } from "lucide-react";

import type { BrewabilityBadge } from "@/features/recipes/brewability-badge";

/**
 * Единственный рендер бейджа готовности рецепта по складу. Семантику считает
 * resolveBrewabilityBadge, вид — этот компонент: везде, где бейдж стоит на
 * настоящем матче со складом (карточки «рецепт под ваш склад», /app/recipes,
 * витрина, макет склада на главной), рендерится он, а не своя копия текста —
 * иначе поверхности снова разъедутся (карточка на дашборде врала зелёным
 * «Хватает всего» там, где витрина честно говорила «Почти хватает»).
 *
 * Единственное исключение — статичная демо-строка `MatchRow` в
 * `components/demo/demo-inventory.tsx`: там весь факт («не хватает Citra 60 г»)
 * по спеке demo-page.md §2.2 сформулирован в самой строке, а бейдж намеренно
 * укорочен до «Хватает» / «Не хватает» без числа.
 *
 * Чистый JSX без хуков — годится и для серверных деревьев (карточка «рецепт под
 * ваш склад» на дашборде и «Моём складе» — серверный компонент), и для клиентских
 * (RecipeMatchBadge).
 */

const SIZES = {
  sm: {
    box: "gap-1 px-2 py-0.5 text-xs font-medium",
    icon: "h-3.5 w-3.5"
  },
  md: {
    box: "gap-1.5 px-2.5 py-1 text-sm font-semibold",
    icon: "h-4 w-4"
  }
} as const;

export function BrewabilityBadgePill({
  badge,
  size = "sm",
  className
}: {
  badge: BrewabilityBadge;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (badge.tier === "hidden") {
    return null;
  }

  const sizing = SIZES[size];
  const base = `pointer-events-none inline-flex shrink-0 items-center whitespace-nowrap rounded-full ring-1 ${sizing.box}`;

  if (badge.tier === "ready") {
    const tone = badge.qtyShort
      ? "bg-lime-50 text-lime-700 ring-lime-200 dark:bg-lime-500/15 dark:text-lime-300 dark:ring-lime-500/30"
      : "bg-success-subtle text-success-subtle-foreground ring-success/30";
    return (
      <span
        className={`${base} ${tone} ${className ?? ""}`}
        title={badge.qtyShort ? "Все ингредиенты есть, но количества под партию может не хватить" : undefined}
      >
        <CircleCheck className={sizing.icon} aria-hidden />
        {badge.qtyShort ? "Почти хватает" : "Хватает всего"}
      </span>
    );
  }

  return (
    <span
      className={`${base} bg-warning-subtle text-warning-subtle-foreground ring-warning/30 ${className ?? ""}`}
      title={`Не хватает ${badge.missing} ${badge.missing === 1 ? "ингредиента" : "ингредиентов"}`}
    >
      <CircleAlert className={sizing.icon} aria-hidden />
      Не хватает {badge.missing}
    </span>
  );
}
