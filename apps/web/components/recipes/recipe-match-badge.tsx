"use client";

import React from "react";
import { CircleAlert, CircleCheck } from "lucide-react";

import { resolveBrewabilityBadge } from "@/features/recipes/brewability-badge";

import { useRecipeMatches } from "./recipe-match-provider";

/**
 * Бейдж готовности рецепта по складу пользователя. Берёт матч из RecipeMatchProvider
 * (после гидрации); для анонима / пустого склада / слабого совпадения ничего не
 * рендерит. Семантика — в resolveBrewabilityBadge (по типам ингредиентов). Градация
 * на корне «хватать»: «Хватает всего» (все типы есть, количества достаточно) —
 * зелёный; «Почти хватает» (типы есть, но количества под партию местами мало) —
 * салатовый; «Не хватает N» (не достаёт 1–2 позиций) — жёлтый.
 */
export function RecipeMatchBadge({ recipeId, className }: { recipeId: string; className?: string }) {
  const ctx = useRecipeMatches();
  if (!ctx || !ctx.ready) {
    return null;
  }

  const match = ctx.getMatch(recipeId);
  if (!match) {
    return null;
  }

  const badge = resolveBrewabilityBadge(match);
  if (badge.tier === "hidden") {
    return null;
  }

  const base =
    "pointer-events-none inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1";

  if (badge.tier === "ready") {
    const tone = badge.qtyShort
      ? "bg-lime-50 text-lime-700 ring-lime-200 dark:bg-lime-500/15 dark:text-lime-300 dark:ring-lime-500/30"
      : "bg-success-subtle text-success-subtle-foreground ring-success/30";
    return (
      <span
        className={`${base} ${tone} ${className ?? ""}`}
        title={badge.qtyShort ? "Все ингредиенты есть, но количества под партию может не хватить" : undefined}
      >
        <CircleCheck className="h-3.5 w-3.5" aria-hidden />
        {badge.qtyShort ? "Почти хватает" : "Хватает всего"}
      </span>
    );
  }

  return (
    <span
      className={`${base} bg-warning-subtle text-warning-subtle-foreground ring-warning/30 ${className ?? ""}`}
      title={`Не хватает ${badge.missing} ${badge.missing === 1 ? "ингредиента" : "ингредиентов"}`}
    >
      <CircleAlert className="h-3.5 w-3.5" aria-hidden />
      Не хватает {badge.missing}
    </span>
  );
}
